// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CrossChainPoolPriceCustomFeed
 * @notice FDC-verified custom price feed updated from PriceRelay relays on Flare.
 *
 * Relay flow (for chains not directly supported by FDC EVMTransaction):
 * - A relayer reads the pool state off-chain on the source chain.
 * - The relayer calls PriceRelay.relayPrice(...) on Flare, emitting PriceRelayed.
 * - FDC attests the Flare transaction (EVMTransaction on Flare).
 * - Anyone calls updateFromProof(proof) here to update the feed.
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

interface IFdcVerification {
    function verifyEVMTransaction(
        IEVMTransaction.Proof calldata _proof
    ) external view returns (bool);
}

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

contract CrossChainPoolPriceCustomFeed is IICustomFeed {
    // ==================== Immutable Configuration ====================

    bytes21 private immutable _feedId;
    int8 private constant DECIMALS = 6;

    /// @notice keccak256("PriceRelayed(uint256,address,uint160,int24,uint128,address,address,uint256,uint256,uint256,address)")
    bytes32 private constant PRICE_RELAYED_TOPIC =
        keccak256(
            "PriceRelayed(uint256,address,uint160,int24,uint128,address,address,uint256,uint256,uint256,address)"
        );

    /// @notice PriceRelay contract on Flare whose events we trust for this feed.
    address public immutable priceRelayAddress;

    /// @notice Source chain ID where the pool exists (e.g., 42161 for Arbitrum).
    uint256 public immutable sourceChainId;

    /// @notice Uniswap V3 pool address on the source chain this feed is locked to.
    address public immutable poolAddress;

    /// @notice FDC verification contract used for proof validation.
    IFdcVerification private immutable fdcVerification;

    uint8 public immutable token0Decimals;
    uint8 public immutable token1Decimals;
    bool public immutable invertPrice;

    // ==================== Mutable State ====================

    address public owner;
    uint256 public latestValue;
    uint64 public lastUpdateTimestamp;
    uint256 public updateCount;
    bool public acceptingUpdates;
    uint256 public totalGasUsedForVerification;
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

    constructor(
        address _priceRelay,
        uint256 _sourceChainId,
        address _poolAddress,
        string memory _feedName,
        address _fdcVerificationAddress,
        uint8 _token0Decimals,
        uint8 _token1Decimals,
        bool _invertPrice
    ) {
        require(_priceRelay != address(0), "Invalid relay address");
        require(_sourceChainId > 0, "Invalid source chain");
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
        priceRelayAddress = _priceRelay;
        sourceChainId = _sourceChainId;
        poolAddress = _poolAddress;
        acceptingUpdates = true;
        token0Decimals = _token0Decimals;
        token1Decimals = _token1Decimals;
        invertPrice = _invertPrice;

        _feedId = _generateFeedId(_feedName);
        fdcVerification = IFdcVerification(_fdcVerificationAddress);
    }

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

        // Add UTF-8 name bytes (one byte per position)
        for (uint256 i = 0; i < nameBytes.length; i++) {
            uint8 shiftAmount = uint8(152 - i * 8);
            id |= bytes21(uint168(uint8(nameBytes[i])) << shiftAmount);
        }

        return id;
    }

    // ==================== Core Update Function ====================

    function updateFromProof(IEVMTransaction.Proof calldata _proof) external {
        require(acceptingUpdates, "Updates paused");

        uint256 gasStart = gasleft();

        // Step 1: Verify FDC proof authenticity
        require(
            fdcVerification.verifyEVMTransaction(_proof),
            "Invalid FDC proof"
        );

        IEVMTransaction.Response memory response = _proof.data;

        // Step 2: Validate transaction succeeded and went to PriceRelay
        require(
            response.responseBody.receivingAddress == priceRelayAddress,
            "Wrong contract address"
        );
        require(response.responseBody.status == 1, "Transaction failed");

        // Step 3: Parse PriceRelayed event
        (uint256 newPrice, uint64 timestamp) = _parseEvents(
            response.responseBody.events
        );

        // Step 4: Store verified price
        latestValue = newPrice;
        lastUpdateTimestamp = timestamp;
        updateCount++;

        // Stats
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

    function _parseEvents(
        IEVMTransaction.Event[] memory events
    ) private view returns (uint256 price, uint64 timestamp) {
        bool found = false;

        for (uint256 i = 0; i < events.length; i++) {
            IEVMTransaction.Event memory evt = events[i];

            // Check emitter address (must be PriceRelay)
            if (evt.emitterAddress != priceRelayAddress) continue;

            // Check event signature (topics[0])
            if (
                evt.topics.length > 0 && evt.topics[0] == PRICE_RELAYED_TOPIC
            ) {
                require(evt.topics.length >= 3, "Invalid topics");

                // Indexed params:
                // topics[1] = sourceChainId (uint256)
                // topics[2] = poolAddress (address)
                uint256 eventChainId = uint256(evt.topics[1]);
                address eventPool = address(uint160(uint256(evt.topics[2])));

                require(eventChainId == sourceChainId, "Wrong source chain");
                require(eventPool == poolAddress, "Wrong pool");

                // Decode non-indexed parameters from data field
                (
                    uint160 sqrtPriceX96,
                    , // tick - unused
                    , // liquidity - unused
                    , // token0 - unused (validated in PriceRelay)
                    , // token1 - unused (validated in PriceRelay)
                    uint256 sourceTimestamp,
                    , // sourceBlockNumber - unused
                    , // relayTimestamp - unused
                    // relayer - unused
                ) = abi.decode(
                        evt.data,
                        (
                            uint160,
                            int24,
                            uint128,
                            address,
                            address,
                            uint256,
                            uint256,
                            uint256,
                            address
                        )
                    );

                price = _calculatePrice(sqrtPriceX96);
                timestamp = uint64(sourceTimestamp);
                found = true;
                break;
            }
        }

        require(found, "PriceRelayed event not found");
    }

    /**
     * @notice Converts sqrtPriceX96 to human-readable price (6 decimals)
     * @dev Copied from PoolPriceCustomFeed (direct feed) to keep behavior identical.
     */
    function _calculatePrice(
        uint160 sqrtPriceX96
    ) private view returns (uint256) {
        uint256 Q96 = 2 ** 96;
        uint256 sqrtPrice = uint256(sqrtPriceX96);

        uint256 priceNumerator;
        uint256 priceDenominator;

        if (sqrtPrice > 2 ** 128) {
            uint256 sqrtPriceReduced = sqrtPrice / (2 ** 64);
            priceNumerator = sqrtPriceReduced * sqrtPriceReduced;
            priceDenominator = 2 ** 64;
        } else {
            priceNumerator = sqrtPrice * sqrtPrice;
            priceDenominator = Q96 * Q96;
        }

        int256 decimalAdjustment = int256(uint256(token0Decimals)) -
            int256(uint256(token1Decimals));

        uint256 scaledNumerator;

        if (decimalAdjustment >= 0) {
            scaledNumerator =
                priceNumerator *
                (10 ** (6 + uint256(decimalAdjustment)));
        } else {
            scaledNumerator = priceNumerator * (10 ** 6);
            priceDenominator =
                priceDenominator *
                (10 ** uint256(-decimalAdjustment));
        }

        uint256 price = scaledNumerator / priceDenominator;

        if (invertPrice && price > 0) {
            price = (10 ** 12) / price;
        }

        require(price > 0, "Price must be positive");
        require(price < type(uint128).max, "Price exceeds maximum");

        return price;
    }

    // ==================== IICustomFeed Implementation ====================

    function feedId() external view override returns (bytes21) {
        return _feedId;
    }

    function read() external view override returns (uint256) {
        require(latestValue > 0, "No data available");
        return latestValue;
    }

    function decimals() external pure override returns (int8) {
        return DECIMALS;
    }

    function calculateFee() external pure override returns (uint256) {
        return 0;
    }

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

    function pauseUpdates() external onlyOwner {
        acceptingUpdates = false;
        emit UpdatesPaused();
    }

    function resumeUpdates() external onlyOwner {
        acceptingUpdates = true;
        emit UpdatesResumed();
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // ==================== View Helper ====================

    struct FeedInfo {
        bytes21 feedId;
        uint256 latestValue;
        int8 decimals;
        uint64 lastUpdate;
        uint256 updateCount;
        address priceRelay;
        uint256 sourceChainId;
        address poolAddress;
        bool acceptingUpdates;
        uint256 avgGasPerUpdate;
        uint256 totalProofsVerified;
    }

    function getFeedInfo() external view returns (FeedInfo memory info) {
        return
            FeedInfo({
                feedId: _feedId,
                latestValue: latestValue,
                decimals: DECIMALS,
                lastUpdate: lastUpdateTimestamp,
                updateCount: updateCount,
                priceRelay: priceRelayAddress,
                sourceChainId: sourceChainId,
                poolAddress: poolAddress,
                acceptingUpdates: acceptingUpdates,
                avgGasPerUpdate: totalProofsVerified > 0
                    ? totalGasUsedForVerification / totalProofsVerified
                    : 0,
                totalProofsVerified: totalProofsVerified
            });
    }
}

