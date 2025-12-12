// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PriceRecorder
 * @notice Helper contract for recording Uniswap V3 pool prices on-chain
 * @dev Creates verifiable on-chain records for FDC attestation
 */

// Minimal Uniswap V3 Pool interface
interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    function liquidity() external view returns (uint128);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
}

contract PriceRecorder {
    // ==================== State Variables ====================

    /// @notice Contract owner (deployer)
    address public owner;

    /// @notice Global recording state (can pause/resume)
    bool public isRecording;

    /// @notice Minimum seconds between updates
    uint256 public updateInterval;

    /// @notice Enabled pools mapping
    mapping(address => bool) public enabledPools;

    /// @notice Pool metadata and state
    mapping(address => PoolInfo) public poolInfo;

    /// @notice List of all pools (for enumeration)
    address[] public poolList;

    /// @notice Pool information struct
    struct PoolInfo {
        address token0;
        address token1;
        uint24 fee;
        uint256 lastUpdate;
        uint256 updateCount;
    }

    // ==================== Events ====================

    /// @notice Emitted when price is recorded
    event PriceRecorded(
        address indexed pool,
        uint160 sqrtPriceX96,
        int24 tick,
        uint128 liquidity,
        address token0,
        address token1,
        uint256 timestamp,
        uint256 blockNumber
    );

    /// @notice Emitted when recording status changes
    event RecordingStatusChanged(bool isRecording);

    /// @notice Emitted when update interval changes
    event UpdateIntervalChanged(uint256 oldInterval, uint256 newInterval);

    /// @notice Emitted when pool is enabled
    event PoolEnabled(
        address indexed pool,
        address token0,
        address token1,
        uint24 fee
    );

    /// @notice Emitted when pool is disabled
    event PoolDisabled(address indexed pool);

    /// @notice Emitted for emergency price recordings
    event EmergencyPriceRecorded(address indexed pool, string reason);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // ==================== Modifiers ====================

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whenRecording() {
        require(isRecording, "Recording is paused");
        _;
    }

    modifier respectsInterval(address pool) {
        require(
            block.timestamp >= poolInfo[pool].lastUpdate + updateInterval,
            "Update interval not elapsed"
        );
        _;
    }

    // ==================== Constructor ====================

    /**
     * @notice Initialize the PriceRecorder contract
     * @param _initialInterval Starting update interval in seconds (e.g., 300 = 5 minutes)
     */
    constructor(uint256 _initialInterval) {
        require(_initialInterval > 0, "Invalid interval");

        owner = msg.sender;
        isRecording = true;
        updateInterval = _initialInterval;

        emit RecordingStatusChanged(true);
        emit UpdateIntervalChanged(0, _initialInterval);
    }

    // ==================== Core Functions ====================

    /**
     * @notice Records current price from a Uniswap V3 pool
     * @param pool Address of the Uniswap V3 pool
     * @dev Callable by anyone if interval has elapsed
     */
    function recordPrice(
        address pool
    ) external whenRecording respectsInterval(pool) {
        require(enabledPools[pool], "Pool not enabled");
        _recordPrice(pool);
    }

    /**
     * @notice Records prices for multiple pools in one transaction
     * @param pools Array of pool addresses
     * @dev More gas efficient for updating multiple pools
     * @dev Maximum 50 pools per batch to prevent gas limit issues
     */
    function recordPriceBatch(address[] calldata pools) external whenRecording {
        require(pools.length <= 50, "Batch too large");

        for (uint256 i = 0; i < pools.length; i++) {
            address pool = pools[i];
            if (
                enabledPools[pool] &&
                block.timestamp >= poolInfo[pool].lastUpdate + updateInterval
            ) {
                _recordPrice(pool);
            }
        }
    }

    /**
     * @notice Emergency price recording bypassing all checks
     * @param pool Pool address
     * @param reason Explanation for emergency recording
     * @dev Owner only, ignores intervals and pause state
     */
    function emergencyRecordPrice(
        address pool,
        string calldata reason
    ) external onlyOwner {
        require(enabledPools[pool], "Pool not enabled");
        _recordPrice(pool);
        emit EmergencyPriceRecorded(pool, reason);
    }

    /**
     * @notice Internal function to record pool price
     * @param pool Pool address
     */
    function _recordPrice(address pool) private {
        // Query pool state
        (
            uint160 sqrtPriceX96,
            int24 tick,
            , // observationIndex - unused
            , // observationCardinality - unused
            , // observationCardinalityNext - unused
            , // feeProtocol - unused
            bool unlocked
        ) = IUniswapV3Pool(pool).slot0();

        require(unlocked, "Pool is locked");

        // Get additional data
        uint128 liquidity = IUniswapV3Pool(pool).liquidity();

        // Use cached token addresses from poolInfo (gas optimization)
        PoolInfo storage info = poolInfo[pool];
        address token0 = info.token0;
        address token1 = info.token1;

        // Update state
        info.lastUpdate = block.timestamp;
        info.updateCount++;

        // Emit comprehensive event (this is what FDC will attest to!)
        emit PriceRecorded(
            pool,
            sqrtPriceX96,
            tick,
            liquidity,
            token0,
            token1,
            block.timestamp,
            block.number
        );
    }

    // ==================== Admin Functions ====================

    /**
     * @notice Enable or disable price recording globally
     * @param _isRecording True to enable, false to pause
     */
    function setRecording(bool _isRecording) external onlyOwner {
        require(isRecording != _isRecording, "Already in this state");
        isRecording = _isRecording;
        emit RecordingStatusChanged(_isRecording);
    }

    /**
     * @notice Update minimum interval between recordings
     * @param _newInterval New interval in seconds
     */
    function setUpdateInterval(uint256 _newInterval) external onlyOwner {
        require(_newInterval > 0, "Interval must be positive");
        require(_newInterval <= 1 days, "Interval too long");

        uint256 oldInterval = updateInterval;
        updateInterval = _newInterval;

        emit UpdateIntervalChanged(oldInterval, _newInterval);
    }

    /**
     * @notice Enable a new pool for price recording
     * @param pool Pool address to enable
     */
    function enablePool(address pool) external onlyOwner {
        require(pool != address(0), "Invalid address");
        require(!enabledPools[pool], "Already enabled");

        // Validate it's a real Uniswap V3 pool by calling slot0()
        try IUniswapV3Pool(pool).slot0() returns (
            uint160,
            int24,
            uint16,
            uint16,
            uint16,
            uint8,
            bool
        ) {
            // Get pool metadata
            address token0 = IUniswapV3Pool(pool).token0();
            address token1 = IUniswapV3Pool(pool).token1();
            uint24 fee = IUniswapV3Pool(pool).fee();

            // Validate pool properties
            require(token0 != token1, "Tokens must be different");
            require(
                fee == 100 || fee == 500 || fee == 3000 || fee == 10000,
                "Invalid fee tier"
            );

            // Check if pool is already in poolList (prevent duplicates on re-enable)
            bool inList = false;
            for (uint256 i = 0; i < poolList.length; i++) {
                if (poolList[i] == pool) {
                    inList = true;
                    break;
                }
            }

            // Store pool info
            enabledPools[pool] = true;
            poolInfo[pool] = PoolInfo({
                token0: token0,
                token1: token1,
                fee: fee,
                lastUpdate: 0,
                updateCount: 0
            });

            // Only add to poolList if not already present
            if (!inList) {
                poolList.push(pool);
            }

            emit PoolEnabled(pool, token0, token1, fee);
        } catch {
            revert("Invalid Uniswap V3 pool");
        }
    }

    /**
     * @notice Disable a pool from recording
     * @param pool Pool address to disable
     */
    function disablePool(address pool) external onlyOwner {
        require(enabledPools[pool], "Pool not enabled");

        enabledPools[pool] = false;

        emit PoolDisabled(pool);
    }

    /**
     * @notice Transfer ownership to a new address
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // ==================== View Functions ====================

    /**
     * @notice Check if a pool can be updated now
     * @param pool Pool address to check
     * @return bool True if update is allowed
     */
    function canUpdate(address pool) external view returns (bool) {
        if (!isRecording || !enabledPools[pool]) return false;
        return block.timestamp >= poolInfo[pool].lastUpdate + updateInterval;
    }

    /**
     * @notice Get time until next update is allowed for a pool
     * @param pool Pool address
     * @return uint256 Seconds until next update (0 if ready now)
     */
    function timeUntilNextUpdate(address pool) external view returns (uint256) {
        if (!enabledPools[pool]) return type(uint256).max;

        uint256 nextAllowedTime = poolInfo[pool].lastUpdate + updateInterval;
        if (block.timestamp >= nextAllowedTime) {
            return 0;
        }
        return nextAllowedTime - block.timestamp;
    }

    /**
     * @notice Get list of all enabled pools
     * @return address[] Array of pool addresses
     */
    function getEnabledPools() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < poolList.length; i++) {
            if (enabledPools[poolList[i]]) count++;
        }

        address[] memory enabled = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < poolList.length; i++) {
            if (enabledPools[poolList[i]]) {
                enabled[index] = poolList[i];
                index++;
            }
        }

        return enabled;
    }

    /**
     * @notice Get detailed info about a pool
     * @param pool Pool address
     * @return PoolInfo struct with pool details
     * @dev Returns info even for disabled pools (useful for diagnostics)
     */
    function getPoolInfo(address pool) external view returns (PoolInfo memory) {
        require(poolInfo[pool].token0 != address(0), "Pool never added");
        return poolInfo[pool];
    }

    /**
     * @notice Get total number of pools (enabled + disabled)
     * @return uint256 Total pool count
     */
    function getPoolCount() external view returns (uint256) {
        return poolList.length;
    }
}
