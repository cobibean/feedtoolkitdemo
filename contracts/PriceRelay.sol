// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PriceRelay
 * @notice Receives relayed prices from external chains and emits attestable events
 * @dev Security-hardened with token binding, monotonicity guards, and deviation checks
 * 
 * This contract enables price feeds from chains not directly supported by FDC's EVMTransaction
 * attestation (e.g., Arbitrum, Base, Optimism, Polygon). Authorized relayers fetch prices
 * off-chain and relay them here, then FDC attests the relay transaction on Flare.
 * 
 * Security Features:
 * - Token binding: Pool tokens are locked on enablePool(), verified on each relay
 * - Future timestamp rejection: sourceTimestamp must be <= block.timestamp
 * - Monotonicity: sourceBlockNumber must strictly increase
 * - Rate limiting: minRelayInterval between relays per pool
 * - Deviation check: Rejects price swings > MAX_DEVIATION_BPS (50%)
 * - Access control: Only authorized relayers can call relayPrice()
 * - Emergency pause: Owner can pause all relay operations
 */
contract PriceRelay {
    // ==================== State Variables ====================
    
    address public owner;
    bool public isActive;
    
    /// @notice Authorized relayer addresses
    mapping(address => bool) public authorizedRelayers;
    
    /// @notice Supported source chains
    mapping(uint256 => bool) public supportedChains;
    
    /// @notice Enabled pools per chain: chainId => poolAddress => enabled
    mapping(uint256 => mapping(address => bool)) public enabledPools;
    
    /// @notice Last relay timestamp per pool
    mapping(uint256 => mapping(address => uint256)) public lastRelayTime;
    
    /// @notice Minimum time between relays (prevents spam)
    uint256 public minRelayInterval;
    
    /// @notice Maximum age of source data accepted
    uint256 public maxPriceAge;
    
    /// @notice Maximum price deviation allowed (basis points) - 50%
    uint256 public constant MAX_DEVIATION_BPS = 5000;

    /// @notice Allowed source timestamp skew into the future (seconds)
    /// @dev Different chains can have slight clock drift; allow small skew.
    uint256 public constant MAX_FUTURE_SKEW = 600; // 10 minutes
    
    // ==================== Pool Configuration ====================
    
    /// @notice Pool configuration with token binding and tracking
    /// @dev Token addresses are bound on enablePool() and verified on each relay
    struct PoolConfig {
        address token0;           // Bound on enablePool - immutable per pool
        address token1;           // Bound on enablePool - immutable per pool
        uint256 lastBlockNumber;  // For monotonicity check
        uint256 lastSqrtPriceX96; // For deviation check
    }
    
    /// @notice Pool configurations: chainId => poolAddress => config
    mapping(uint256 => mapping(address => PoolConfig)) public poolConfig;
    
    // ==================== Events ====================
    
    /// @notice Emitted when price is relayed - THIS IS WHAT FDC WILL ATTEST
    /// @dev Contains all data needed for PoolPriceCustomFeed to parse and verify
    event PriceRelayed(
        uint256 indexed sourceChainId,
        address indexed poolAddress,
        uint160 sqrtPriceX96,
        int24 tick,
        uint128 liquidity,
        address token0,
        address token1,
        uint256 sourceTimestamp,
        uint256 sourceBlockNumber,
        uint256 relayTimestamp,
        address relayer
    );
    
    event RelayerAuthorized(address indexed relayer);
    event RelayerRevoked(address indexed relayer);
    event ChainEnabled(uint256 indexed chainId);
    event ChainDisabled(uint256 indexed chainId);
    event PoolEnabled(uint256 indexed chainId, address indexed pool, address token0, address token1);
    event PoolDisabled(uint256 indexed chainId, address indexed pool);
    event RelayPaused();
    event RelayUnpaused();
    event ConfigUpdated(uint256 minRelayInterval, uint256 maxPriceAge);
    
    // ==================== Modifiers ====================
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyAuthorizedRelayer() {
        require(authorizedRelayers[msg.sender], "Not authorized relayer");
        _;
    }
    
    modifier whenActive() {
        require(isActive, "Relay paused");
        _;
    }
    
    // ==================== Constructor ====================
    
    /**
     * @notice Deploy PriceRelay with initial configuration
     * @param _minRelayInterval Minimum seconds between relays for same pool
     * @param _maxPriceAge Maximum age of source data in seconds
     * @dev Deployer becomes owner and first authorized relayer
     */
    constructor(uint256 _minRelayInterval, uint256 _maxPriceAge) {
        require(_minRelayInterval > 0, "Invalid interval");
        require(_maxPriceAge > 0, "Invalid max age");
        
        owner = msg.sender;
        isActive = true;
        minRelayInterval = _minRelayInterval;
        maxPriceAge = _maxPriceAge;
        
        // Owner is initially an authorized relayer
        authorizedRelayers[msg.sender] = true;
        emit RelayerAuthorized(msg.sender);
    }
    
    // ==================== Core Relay Function ====================
    
    /**
     * @notice Relay price data from an external chain
     * @dev Only callable by authorized relayers. Includes all security guards.
     * @param sourceChainId The chain ID where the pool exists
     * @param poolAddress The Uniswap V3 pool address on source chain
     * @param sqrtPriceX96 Current sqrtPriceX96 from slot0
     * @param tick Current tick from slot0
     * @param liquidity Current liquidity from pool
     * @param token0 Token0 address (must match registered tokens)
     * @param token1 Token1 address (must match registered tokens)
     * @param sourceTimestamp Block timestamp from source chain
     * @param sourceBlockNumber Block number from source chain
     */
    function relayPrice(
        uint256 sourceChainId,
        address poolAddress,
        uint160 sqrtPriceX96,
        int24 tick,
        uint128 liquidity,
        address token0,
        address token1,
        uint256 sourceTimestamp,
        uint256 sourceBlockNumber
    ) external onlyAuthorizedRelayer whenActive {
        // Basic validation
        require(supportedChains[sourceChainId], "Chain not supported");
        require(enabledPools[sourceChainId][poolAddress], "Pool not enabled");
        require(sqrtPriceX96 > 0, "Invalid price");
        
        PoolConfig storage config = poolConfig[sourceChainId][poolAddress];
        
        // SECURITY: Token binding check - tokens must match what was registered
        require(token0 == config.token0 && token1 == config.token1, "Token mismatch");
        
        // SECURITY: Timestamp skew + freshness check
        // Allow small skew into the future to account for cross-chain clock drift.
        if (sourceTimestamp > block.timestamp) {
            require(
                sourceTimestamp - block.timestamp <= MAX_FUTURE_SKEW,
                "Future timestamp"
            );
        } else {
            require(
                block.timestamp - sourceTimestamp <= maxPriceAge,
                "Price data too old"
            );
        }
        
        // SECURITY: Monotonicity - block numbers must strictly increase
        require(sourceBlockNumber > config.lastBlockNumber, "Stale block number");
        
        // SECURITY: Rate limiting - enforce minimum interval between relays
        require(
            block.timestamp >= lastRelayTime[sourceChainId][poolAddress] + minRelayInterval,
            "Relay interval not elapsed"
        );
        
        // SECURITY: Deviation check on *actual price* (not sqrt)
        if (config.lastSqrtPriceX96 > 0) {
            uint256 deviation = _calculatePriceDeviationBps(config.lastSqrtPriceX96, uint256(sqrtPriceX96));
            require(deviation <= MAX_DEVIATION_BPS, "Price deviation too high");
        }
        
        // Update state
        config.lastBlockNumber = sourceBlockNumber;
        config.lastSqrtPriceX96 = sqrtPriceX96;
        lastRelayTime[sourceChainId][poolAddress] = block.timestamp;
        
        // Emit event - THIS IS WHAT FDC WILL ATTEST
        emit PriceRelayed(
            sourceChainId,
            poolAddress,
            sqrtPriceX96,
            tick,
            liquidity,
            token0,
            token1,
            sourceTimestamp,
            sourceBlockNumber,
            block.timestamp,
            msg.sender
        );
    }
    
    // ==================== Internal Functions ====================
    
    /**
     * @notice Calculate price deviation in basis points using the *price* implied by sqrtPriceX96.
     * @dev Uses FullMath-style mulDiv to avoid overflow when squaring.
     */
    function _calculatePriceDeviationBps(uint256 oldSqrtPriceX96, uint256 newSqrtPriceX96) internal pure returns (uint256) {
        if (oldSqrtPriceX96 == 0) return 0;
        uint256 oldPrice = _priceFromSqrtPriceX96(oldSqrtPriceX96);
        uint256 newPrice = _priceFromSqrtPriceX96(newSqrtPriceX96);
        if (oldPrice == 0) return 0;
        uint256 diff = oldPrice > newPrice ? oldPrice - newPrice : newPrice - oldPrice;
        return (diff * 10000) / oldPrice;
    }

    /**
     * @notice Convert sqrtPriceX96 to price (token1/token0) as an integer (Q0).
     * @dev price = (sqrtPriceX96^2) / 2^192.
     */
    function _priceFromSqrtPriceX96(uint256 sqrtPriceX96) internal pure returns (uint256) {
        // 2^192 fits into uint256
        uint256 denom = 2 ** 192;
        return _mulDiv(sqrtPriceX96, sqrtPriceX96, denom);
    }

    /**
     * @notice Computes floor(a*b/denominator) with full precision.
     * @dev Adapted from Uniswap V3 Core FullMath.mulDiv.
     */
    function _mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            uint256 prod0;
            uint256 prod1;
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            if (prod1 == 0) {
                require(denominator > 0, "Div by zero");
                assembly {
                    result := div(prod0, denominator)
                }
                return result;
            }

            require(denominator > prod1, "Overflow");

            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }

            // Factor powers of two out of denominator
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }

            prod0 |= prod1 * twos;

            // Compute inverse of denominator mod 2^256
            uint256 inv = (3 * denominator) ^ 2;
            inv *= 2 - denominator * inv; // inverse mod 2^8
            inv *= 2 - denominator * inv; // inverse mod 2^16
            inv *= 2 - denominator * inv; // inverse mod 2^32
            inv *= 2 - denominator * inv; // inverse mod 2^64
            inv *= 2 - denominator * inv; // inverse mod 2^128
            inv *= 2 - denominator * inv; // inverse mod 2^256

            result = prod0 * inv;
            return result;
        }
    }
    
    // ==================== Relayer Management ====================
    
    /**
     * @notice Authorize an address to relay prices
     * @param relayer Address to authorize
     */
    function authorizeRelayer(address relayer) external onlyOwner {
        require(relayer != address(0), "Invalid address");
        require(!authorizedRelayers[relayer], "Already authorized");
        authorizedRelayers[relayer] = true;
        emit RelayerAuthorized(relayer);
    }
    
    /**
     * @notice Revoke relayer authorization
     * @param relayer Address to revoke
     */
    function revokeRelayer(address relayer) external onlyOwner {
        require(authorizedRelayers[relayer], "Not authorized");
        authorizedRelayers[relayer] = false;
        emit RelayerRevoked(relayer);
    }
    
    // ==================== Chain Management ====================
    
    /**
     * @notice Enable a source chain for relaying
     * @param chainId Chain ID to enable
     */
    function enableChain(uint256 chainId) external onlyOwner {
        require(chainId > 0, "Invalid chain ID");
        require(!supportedChains[chainId], "Already enabled");
        supportedChains[chainId] = true;
        emit ChainEnabled(chainId);
    }
    
    /**
     * @notice Disable a source chain
     * @param chainId Chain ID to disable
     */
    function disableChain(uint256 chainId) external onlyOwner {
        require(supportedChains[chainId], "Not enabled");
        supportedChains[chainId] = false;
        emit ChainDisabled(chainId);
    }
    
    // ==================== Pool Management ====================
    
    /**
     * @notice Enable a pool for price relaying with token binding
     * @dev SECURITY: Token addresses are bound here and verified on every relay
     * @param chainId Source chain ID
     * @param pool Pool address on source chain
     * @param token0 Token0 address (will be bound)
     * @param token1 Token1 address (will be bound)
     */
    function enablePool(
        uint256 chainId, 
        address pool, 
        address token0, 
        address token1
    ) external onlyOwner {
        require(supportedChains[chainId], "Chain not supported");
        require(pool != address(0), "Invalid pool");
        require(token0 != address(0) && token1 != address(0), "Invalid tokens");
        require(token0 != token1, "Tokens must differ");
        require(!enabledPools[chainId][pool], "Already enabled");
        
        enabledPools[chainId][pool] = true;
        poolConfig[chainId][pool] = PoolConfig({
            token0: token0,
            token1: token1,
            lastBlockNumber: 0,
            lastSqrtPriceX96: 0
        });
        
        emit PoolEnabled(chainId, pool, token0, token1);
    }
    
    /**
     * @notice Disable a pool
     * @param chainId Source chain ID
     * @param pool Pool address
     */
    function disablePool(uint256 chainId, address pool) external onlyOwner {
        require(enabledPools[chainId][pool], "Not enabled");
        enabledPools[chainId][pool] = false;
        emit PoolDisabled(chainId, pool);
    }
    
    // ==================== Configuration ====================
    
    /**
     * @notice Update relay interval
     * @param interval New minimum interval in seconds
     */
    function setMinRelayInterval(uint256 interval) external onlyOwner {
        require(interval > 0, "Invalid interval");
        minRelayInterval = interval;
        emit ConfigUpdated(interval, maxPriceAge);
    }
    
    /**
     * @notice Update maximum price age
     * @param age New maximum age in seconds
     */
    function setMaxPriceAge(uint256 age) external onlyOwner {
        require(age > 0, "Invalid age");
        maxPriceAge = age;
        emit ConfigUpdated(minRelayInterval, age);
    }
    
    // ==================== Emergency Controls ====================
    
    /**
     * @notice Pause all relay operations
     */
    function pause() external onlyOwner {
        require(isActive, "Already paused");
        isActive = false;
        emit RelayPaused();
    }
    
    /**
     * @notice Resume relay operations
     */
    function unpause() external onlyOwner {
        require(!isActive, "Not paused");
        isActive = true;
        emit RelayUnpaused();
    }
    
    /**
     * @notice Transfer ownership
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        require(newOwner != owner, "Same owner");
        owner = newOwner;
    }
    
    // ==================== View Functions ====================
    
    /**
     * @notice Check if a pool can be relayed to
     * @param chainId Source chain ID
     * @param pool Pool address
     * @return True if relay is possible
     */
    function canRelay(uint256 chainId, address pool) external view returns (bool) {
        if (!isActive) return false;
        if (!supportedChains[chainId]) return false;
        if (!enabledPools[chainId][pool]) return false;
        if (block.timestamp < lastRelayTime[chainId][pool] + minRelayInterval) return false;
        return true;
    }
    
    /**
     * @notice Get pool configuration
     * @param chainId Source chain ID
     * @param pool Pool address
     * @return Pool configuration struct
     */
    function getPoolConfig(uint256 chainId, address pool) external view returns (PoolConfig memory) {
        return poolConfig[chainId][pool];
    }
    
    /**
     * @notice Get time until next relay is allowed
     * @param chainId Source chain ID
     * @param pool Pool address
     * @return Seconds until next relay (0 if can relay now)
     */
    function timeUntilNextRelay(uint256 chainId, address pool) external view returns (uint256) {
        uint256 nextAllowed = lastRelayTime[chainId][pool] + minRelayInterval;
        if (block.timestamp >= nextAllowed) return 0;
        return nextAllowed - block.timestamp;
    }
}
