// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @notice Test-only mock that always returns true for verifyEVMTransaction.
 * @dev Used for Hardhat unit tests. Do not deploy to production.
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

contract MockFdcVerification {
    function verifyEVMTransaction(IEVMTransaction.Proof calldata) external pure returns (bool) {
        return true;
    }
}

