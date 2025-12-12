// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PoolPriceCustomFeed
 * @notice FDC-verified custom price feed for a single Uniswap V3-style pool.
 * @dev Deploy one instance per pool/feed; implements IICustomFeed for FTSO compatibility.
 */

/**
 * @title IICustomFeed
 * @notice Interface for custom FTSO feeds
 */
interface IICustomFeed {
    function feedId() external view returns (bytes21 _feedId);
    function read() external view returns (uint256 value);
    function decimals() external pure returns (int8);
    function calculateFee() external pure returns (uint256 _fee);
    function getCurrentFeed()
        external
        payable
        returns (uint256 _value, int8 _decimals, uint64 _timestamp);
}

/**
 * @title IFdcVerification
 * @notice Interface for Flare Data Connector verification
 */
interface IFdcVerification {
    function verifyEVMTransaction(
        IEVMTransaction.Proof calldata _proof
    ) external view returns (bool);
}

/**
 * @title IEVMTransaction
 * @notice EVMTransaction attestation type structures
 */
interface IEVMTransaction {
    struct Proof {
        bytes32[] merkleProof;
        Response data;
    }

    struct Response {
        bytes32 attestationType;
        bytes32 sourceId;
        uint64 votingRound;
        uint64 lowestUsedTimestamp;
        RequestBody requestBody;
        ResponseBody responseBody;
    }

    struct RequestBody {
        bytes32 transactionHash;
        uint16 requiredConfirmations;
        bool provideInput;
        bool listEvents;
        uint32[] logIndices;
    }

    struct ResponseBody {
        uint64 blockNumber;
        uint64 timestamp;
        address sourceAddress;
        bool isDeployment;
        address receivingAddress;
        uint256 value;
        bytes input;
        uint8 status;
        Event[] events;
    }

    struct Event {
        uint32 logIndex;
        address emitterAddress;
        bytes32[] topics;
        bytes data;
        bool removed;
    }
}

/**
 * @title IFlareContractRegistry
 * @notice Interface for Flare's contract registry
 */
interface IFlareContractRegistry {
    function getContractAddressByName(
        string calldata _name
    ) external view returns (address);
}

contract PoolPriceCustomFeed is IICustomFeed {
    // ==================== Immutable Configuration ====================

    /// @notice Unique feed identifier (starts with 0x21 for custom feeds)
    bytes21 private immutable _feedId;

    /// @notice Decimal precision (6 decimals to match tokens)
    int8 private constant DECIMALS = 6;

    /// @notice keccak256("PriceRecorded(address,uint160,int24,uint128,address,address,uint256,uint256)")
    bytes32 private constant PRICE_RECORDED_TOPIC =
        keccak256(
            "PriceRecorded(address,uint160,int24,uint128,address,address,uint256,uint256)"
        );

    /// @notice PriceRecorder contract whose events we trust for this feed.
    address public immutable priceRecorderAddress;

    /// @notice Uniswap V3 pool address this feed is locked to.
    address public immutable poolAddress;

    /// @notice FDC verification contract used for proof validation.
    IFdcVerification private immutable fdcVerification;

    /// @notice Token0 decimals (for decimal-aware price calculation)
    uint8 public immutable token0Decimals;

    /// @notice Token1 decimals (for decimal-aware price calculation)
    uint8 public immutable token1Decimals;

    /// @notice Whether to invert the price (for market convention)
    bool public immutable invertPrice;

    // ==================== Mutable State ====================

    /// @notice Contract owner
    address public owner;

    /// @notice Latest verified price
    uint256 public latestValue;

    /// @notice Timestamp of last update
    uint64 public lastUpdateTimestamp;

    /// @notice Total number of updates received
    uint256 public updateCount;

    /// @notice Whether feed is accepting updates
    bool public acceptingUpdates;

    /// @notice Total gas used for all verifications
    uint256 public totalGasUsedForVerification;

    /// @notice Total proofs successfully verified
    uint256 public totalProofsVerified;

    // ==================== Events ====================

    event FeedUpdated(
        uint256 indexed value,
        uint64 timestamp,
        uint256 blockNumber,
        address indexed updater
    );

    event ProofVerified(
        bytes32 indexed transactionHash,
        uint256 value,
        uint64 timestamp
    );

    event UpdatesPaused();
    event UpdatesResumed();
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // ==================== Modifiers ====================

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ==================== Constructor ====================

    /**
     * @notice Initialize the custom feed (one instance per pool).
     * @param _priceRecorder Address of the trusted PriceRecorder contract.
     * @param _poolAddress Address of the single pool whose prices we will accept.
     * @param _feedName UTF-8 name for feed ID generation (e.g., "FXRP/USDTo-PRICE").
     * @param _fdcVerificationAddress Address of the FDC verification contract.
     * @param _token0Decimals Decimals of token0 in the pool (for price adjustment).
     * @param _token1Decimals Decimals of token1 in the pool (for price adjustment).
     * @param _invertPrice Whether to invert the price (for market convention).
     */
    constructor(
        address _priceRecorder,
        address _poolAddress,
        string memory _feedName,
        address _fdcVerificationAddress,
        uint8 _token0Decimals,
        uint8 _token1Decimals,
        bool _invertPrice
    ) {
        require(_priceRecorder != address(0), "Invalid recorder address");
        require(_poolAddress != address(0), "Invalid pool address");
        require(_fdcVerificationAddress != address(0), "Invalid FDC address");
        require(
            _token0Decimals > 0 && _token0Decimals <= 18,
            "Invalid token0 decimals"
        );
        require(
            _token1Decimals > 0 && _token1Decimals <= 18,
            "Invalid token1 decimals"
        );

        owner = msg.sender;
        priceRecorderAddress = _priceRecorder;
        poolAddress = _poolAddress;
        acceptingUpdates = true;
        token0Decimals = _token0Decimals;
        token1Decimals = _token1Decimals;
        invertPrice = _invertPrice;

        // Generate feed ID: 0x21 + hex(feedName) + zero padding
        _feedId = _generateFeedId(_feedName);

        // Set FDC verification contract
        fdcVerification = IFdcVerification(_fdcVerificationAddress);
    }

    /**
     * @notice Generates feed ID from name
     * @param name Feed name in UTF-8 (max 20 bytes)
     * @return bytes21 Feed ID (0x21 + hex-encoded name + padding)
     */
    function _generateFeedId(
        string memory name
    ) private pure returns (bytes21) {
        bytes memory nameBytes = bytes(name);
        require(
            nameBytes.length > 0 && nameBytes.length <= 20,
            "Invalid name length"
        );

        bytes21 id;
        // Set category byte (0x21 for custom feeds)
        id = bytes21(uint168(0x21) << 160);

        // Add hex-encoded name
        for (uint256 i = 0; i < nameBytes.length; i++) {
            // Shift amount: 152, 144, 136, ... (decreasing by 8)
            uint8 shiftAmount = uint8(152 - i * 8);
            id |= bytes21(uint168(uint8(nameBytes[i])) << shiftAmount);
        }

        return id;
    }

    // ==================== Core Update Function ====================

    /**
     * @notice Updates feed with FDC-verified price data
     * @param _proof EVMTransaction proof from FDC
     * @dev Anyone can call this to update the feed with valid proof
     */
    function updateFromProof(IEVMTransaction.Proof calldata _proof) external {
        require(acceptingUpdates, "Updates paused");

        uint256 gasStart = gasleft();

        // Step 1: Verify FDC proof authenticity
        require(
            fdcVerification.verifyEVMTransaction(_proof),
            "Invalid FDC proof"
        );

        // Step 2: Extract response from proof
        IEVMTransaction.Response memory response = _proof.data;

        // Step 3: Validate transaction source (must be from PriceRecorder)
        require(
            response.responseBody.receivingAddress == priceRecorderAddress,
            "Wrong contract address"
        );

        // Step 3a: Validate transaction succeeded (defensive coding)
        require(response.responseBody.status == 1, "Transaction failed");

        // Step 4: Parse events for PriceRecorded event
        (uint256 newPrice, uint64 timestamp) = _parseEvents(
            response.responseBody.events
        );

        // Step 5: Store verified price
        latestValue = newPrice;
        lastUpdateTimestamp = timestamp;
        updateCount++;

        // Track statistics
        uint256 gasUsed = gasStart - gasleft();
        totalGasUsedForVerification += gasUsed;
        totalProofsVerified++;

        emit FeedUpdated(newPrice, timestamp, block.number, msg.sender);
        emit ProofVerified(
            response.requestBody.transactionHash,
            newPrice,
            timestamp
        );
    }

    /**
     * @notice Parses PriceRecorded event from transaction logs
     * @param events Array of events from FDC proof
     * @return price Calculated price with decimals
     * @return timestamp Event timestamp
     */
    function _parseEvents(
        IEVMTransaction.Event[] memory events
    ) private view returns (uint256 price, uint64 timestamp) {
        bool found = false;

        for (uint256 i = 0; i < events.length; i++) {
            IEVMTransaction.Event memory evt = events[i];

            // Check emitter address (must be PriceRecorder)
            if (evt.emitterAddress != priceRecorderAddress) continue;

            // Check event signature (topics[0])
            if (
                evt.topics.length > 0 && evt.topics[0] == PRICE_RECORDED_TOPIC
            ) {
                // Decode indexed parameter: topics[1] = pool address
                address eventPool = address(uint160(uint256(evt.topics[1])));
                require(eventPool == poolAddress, "Wrong pool");

                // Decode non-indexed parameters from data field
                (
                    uint160 sqrtPriceX96,
                    , // tick - unused
                    , // liquidity - unused
                    , // token0 - unused
                    , // token1 - unused
                    uint256 eventTimestamp,

                ) = abi.decode(
                        // blockNumber - unused
                        evt.data,
                        (
                            uint160,
                            int24,
                            uint128,
                            address,
                            address,
                            uint256,
                            uint256
                        )
                    );

                // Calculate human-readable price
                price = _calculatePrice(sqrtPriceX96);
                timestamp = uint64(eventTimestamp);
                found = true;
                break;
            }
        }

        require(found, "PriceRecorded event not found");
    }

    /**
     * @notice Converts sqrtPriceX96 to human-readable price
     * @param sqrtPriceX96 Square root price in Q64.96 format
     * @return uint256 Price with DECIMALS precision
     * @dev Applies decimal adjustment for pools with different token decimals
     * @dev Uses careful ordering of operations to avoid uint256 overflow
     */
    function _calculatePrice(
        uint160 sqrtPriceX96
    ) private view returns (uint256) {
        // Uniswap V3 price formula: price = (sqrtPriceX96 / 2^96)^2
        // This gives token1/token0 ratio in native units
        // For tokens with different decimals, we need to adjust:
        // actual_price = raw_price * 10^(decimals0 - decimals1)

        uint256 Q96 = 2 ** 96;
        uint256 sqrtPrice = uint256(sqrtPriceX96);

        // Calculate price carefully to avoid overflow
        // We need: (sqrtPriceX96^2 / 2^192) * 10^18 * 10^(decimals0 - decimals1) / 10^12
        // 
        // For very large sqrtPriceX96 values (like USDC/WETH), sqrtPrice^2 can overflow uint256
        // So we calculate in steps, dividing early to keep numbers manageable
        
        // First, divide sqrtPriceX96 by 2^48 to make the number smaller
        // Then square it, then divide by 2^96 (instead of 2^192)
        // This is equivalent but avoids overflow
        uint256 priceNumerator;
        uint256 priceDenominator;
        
        if (sqrtPrice > 2**128) {
            // For very large sqrtPriceX96 (e.g., stablecoin/ETH pairs)
            // sqrtPrice / 2^64, then square, gives us price * 2^64
            uint256 sqrtPriceReduced = sqrtPrice / (2**64);
            // sqrtPriceReduced^2 * 10^6 / 2^64 gives price in 6 decimals
            priceNumerator = sqrtPriceReduced * sqrtPriceReduced;
            priceDenominator = 2**64;
        } else {
            // For smaller sqrtPriceX96 values, use full precision
            priceNumerator = sqrtPrice * sqrtPrice;
            priceDenominator = Q96 * Q96;
        }

        // Apply decimal adjustment BEFORE the division to maintain precision
        // decimalAdjustment = token0Decimals - token1Decimals
        int256 decimalAdjustment = int256(uint256(token0Decimals)) -
            int256(uint256(token1Decimals));
        
        // We want final result in 6 decimals
        // Start by scaling the numerator
        uint256 scaledNumerator;
        
        if (decimalAdjustment >= 0) {
            // token0 has more or equal decimals
            // Scale up numerator by 10^(6 + adjustment)
            scaledNumerator = priceNumerator * (10 ** (6 + uint256(decimalAdjustment)));
        } else {
            // token1 has more decimals
            // We need to account for this in the denominator instead
            scaledNumerator = priceNumerator * (10 ** 6);
            priceDenominator = priceDenominator * (10 ** uint256(-decimalAdjustment));
        }
        
        uint256 price = scaledNumerator / priceDenominator;

        // Apply price inversion if configured (for market convention)
        if (invertPrice && price > 0) {
            // Invert: 1 / price (maintaining 6 decimal precision)
            // 10^12 / price gives us inverted price in 6 decimals
            price = (10 ** 12) / price;
        }

        // Sanity checks
        require(price > 0, "Price must be positive");
        require(price < type(uint128).max, "Price exceeds maximum");

        return price;
    }

    // ==================== IICustomFeed Implementation ====================

    /**
     * @notice Returns the feed identifier
     * @return bytes21 Feed ID starting with 0x21
     */
    function feedId() external view override returns (bytes21) {
        return _feedId;
    }

    /**
     * @notice Returns the latest verified price
     * @return uint256 Price value with DECIMALS precision
     */
    function read() external view override returns (uint256) {
        require(latestValue > 0, "No data available");
        return latestValue;
    }

    /**
     * @notice Returns decimal precision
     * @return int8 Number of decimals (6)
     */
    function decimals() external pure override returns (int8) {
        return DECIMALS;
    }

    /**
     * @notice Calculates fee for reading (free for this implementation)
     * @return uint256 Fee amount (0)
     */
    function calculateFee() external pure override returns (uint256) {
        return 0; // Free to read
    }

    /**
     * @notice Returns current feed data with timestamp
     * @return _value uint256 Current price
     * @return _decimals int8 Decimal precision
     * @return _timestamp uint64 Last update time
     */
    function getCurrentFeed()
        external
        payable
        override
        returns (uint256 _value, int8 _decimals, uint64 _timestamp)
    {
        require(latestValue > 0, "No data available");
        return (latestValue, DECIMALS, lastUpdateTimestamp);
    }

    // ==================== Admin Functions ====================

    /**
     * @notice Pause feed updates (emergency)
     */
    function pauseUpdates() external onlyOwner {
        acceptingUpdates = false;
        emit UpdatesPaused();
    }

    /**
     * @notice Resume feed updates
     */
    function resumeUpdates() external onlyOwner {
        acceptingUpdates = true;
        emit UpdatesResumed();
    }

    /**
     * @notice Transfer ownership
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
     * @notice Get comprehensive feed information
     * @return info Struct with all feed metadata
     */
    function getFeedInfo() external view returns (FeedInfo memory info) {
        return
            FeedInfo({
                feedId: _feedId,
                latestValue: latestValue,
                decimals: DECIMALS,
                lastUpdate: lastUpdateTimestamp,
                updateCount: updateCount,
                priceRecorder: priceRecorderAddress,
                poolAddress: poolAddress,
                acceptingUpdates: acceptingUpdates,
                avgGasPerUpdate: totalProofsVerified > 0
                    ? totalGasUsedForVerification / totalProofsVerified
                    : 0,
                totalProofsVerified: totalProofsVerified
            });
    }

    struct FeedInfo {
        bytes21 feedId;
        uint256 latestValue;
        int8 decimals;
        uint64 lastUpdate;
        uint256 updateCount;
        address priceRecorder;
        address poolAddress;
        bool acceptingUpdates;
        uint256 avgGasPerUpdate;
        uint256 totalProofsVerified;
    }
}

