// Auto-generated from Hardhat artifact
// contracts/PriceRelay.sol

export const PRICE_RELAY_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_minRelayInterval",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_maxPriceAge",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      }
    ],
    "name": "ChainDisabled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      }
    ],
    "name": "ChainEnabled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "minRelayInterval",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "maxPriceAge",
        "type": "uint256"
      }
    ],
    "name": "ConfigUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "pool",
        "type": "address"
      }
    ],
    "name": "PoolDisabled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "pool",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "token1",
        "type": "address"
      }
    ],
    "name": "PoolEnabled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "sourceChainId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "poolAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint160",
        "name": "sqrtPriceX96",
        "type": "uint160"
      },
      {
        "indexed": false,
        "internalType": "int24",
        "name": "tick",
        "type": "int24"
      },
      {
        "indexed": false,
        "internalType": "uint128",
        "name": "liquidity",
        "type": "uint128"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "token1",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "sourceTimestamp",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "sourceBlockNumber",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "relayTimestamp",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "relayer",
        "type": "address"
      }
    ],
    "name": "PriceRelayed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "RelayPaused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "RelayUnpaused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "relayer",
        "type": "address"
      }
    ],
    "name": "RelayerAuthorized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "relayer",
        "type": "address"
      }
    ],
    "name": "RelayerRevoked",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MAX_DEVIATION_BPS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_FUTURE_SKEW",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "relayer",
        "type": "address"
      }
    ],
    "name": "authorizeRelayer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "authorizedRelayers",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "pool",
        "type": "address"
      }
    ],
    "name": "canRelay",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      }
    ],
    "name": "disableChain",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "pool",
        "type": "address"
      }
    ],
    "name": "disablePool",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      }
    ],
    "name": "enableChain",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "pool",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token1",
        "type": "address"
      }
    ],
    "name": "enablePool",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "enabledPools",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "pool",
        "type": "address"
      }
    ],
    "name": "getPoolConfig",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "token0",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token1",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "lastBlockNumber",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastSqrtPriceX96",
            "type": "uint256"
          }
        ],
        "internalType": "struct PriceRelay.PoolConfig",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "isActive",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "lastRelayTime",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxPriceAge",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minRelayInterval",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "poolConfig",
    "outputs": [
      {
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token1",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "lastBlockNumber",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lastSqrtPriceX96",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "sourceChainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "poolAddress",
        "type": "address"
      },
      {
        "internalType": "uint160",
        "name": "sqrtPriceX96",
        "type": "uint160"
      },
      {
        "internalType": "int24",
        "name": "tick",
        "type": "int24"
      },
      {
        "internalType": "uint128",
        "name": "liquidity",
        "type": "uint128"
      },
      {
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token1",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "sourceTimestamp",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "sourceBlockNumber",
        "type": "uint256"
      }
    ],
    "name": "relayPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "relayer",
        "type": "address"
      }
    ],
    "name": "revokeRelayer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "age",
        "type": "uint256"
      }
    ],
    "name": "setMaxPriceAge",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "interval",
        "type": "uint256"
      }
    ],
    "name": "setMinRelayInterval",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "supportedChains",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "pool",
        "type": "address"
      }
    ],
    "name": "timeUntilNextRelay",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const PRICE_RELAY_BYTECODE = "0x608060405234801561001057600080fd5b5060405162001b2d38038062001b2d83398101604081905261003191610133565b600082116100795760405162461bcd60e51b815260206004820152601060248201526f125b9d985b1a59081a5b9d195c9d985b60821b60448201526064015b60405180910390fd5b600081116100bb5760405162461bcd60e51b815260206004820152600f60248201526e496e76616c6964206d61782061676560881b6044820152606401610070565b6000805460ff60a01b19339081166001600160a81b031990921691909117600160a01b17825560058490556006839055808252600160208190526040808420805460ff19169092179091555190917f34aff43ff674361fe2288d5bfdd1c3ee4c20de76d41536ac0e195c6b59552ff591a25050610157565b6000806040838503121561014657600080fd5b505080516020909101519092909150565b6119c680620001676000396000f3fe608060405234801561001057600080fd5b506004361061018e5760003560e01c80635669d4b8116100de5780639429939011610097578063f2fde38b11610071578063f2fde38b146103ed578063f42d1ec514610400578063f6f27325146104c6578063f899b23c146104d957600080fd5b806394299390146103be578063a4a05f82146103c7578063ced74eb4146103da57600080fd5b80635669d4b81461030c5780636821afab146103375780637a0466741461034a5780638456cb591461035d5780638c97fe2b146103655780638da5cb5b1461039357600080fd5b806329e295c51161014b5780634f082843116101255780634f082843146102b057806354032302146102c3578063548d496f146102d657806356447ce8146102f957600080fd5b806329e295c51461027257806333e67012146102955780633f4ba83a146102a857600080fd5b80631584410a1461019357806315db04fc146101af57806319c00d46146101b857806321ef5f8b1461023057806322f3e2d41461024557806325c6840314610269575b600080fd5b61019c60065481565b6040519081526020015b60405180910390f35b61019c61025881565b6102056101c6366004611791565b600760209081526000928352604080842090915290825290208054600182015460028301546003909301546001600160a01b0392831693919092169184565b604080516001600160a01b0395861681529490931660208501529183015260608201526080016101a6565b61024361023e3660046117c1565b6104ec565b005b60005461025990600160a01b900460ff1681565b60405190151581526020016101a6565b61019c61138881565b6102596102803660046117c1565b60016020526000908152604090205460ff1681565b6102436102a33660046117de565b6105c1565b610243610677565b6102436102be3660046117de565b610724565b6102436102d13660046117de565b610825565b6102596102e43660046117de565b60026020526000908152604090205460ff1681565b6102436103073660046117de565b6108d8565b61019c61031a366004611791565b600460209081526000928352604080842090915290825290205481565b610259610345366004611791565b61097e565b61019c610358366004611791565b610a31565b610243610a8a565b610259610373366004611791565b600360209081526000928352604080842090915290825290205460ff1681565b6000546103a6906001600160a01b031681565b6040516001600160a01b0390911681526020016101a6565b61019c60055481565b6102436103d5366004611791565b610b34565b6102436103e83660046117f7565b610c16565b6102436103fb3660046117c1565b6110ed565b61048561040e366004611791565b6040805160808082018352600080835260208084018290528385018290526060938401829052958152600786528381206001600160a01b0395861682528652839020835191820184528054851682526001810154909416948101949094526002830154918401919091526003909101549082015290565b6040516101a6919081516001600160a01b03908116825260208084015190911690820152604080830151908201526060918201519181019190915260800190565b6102436104d43660046118a5565b6111cc565b6102436104e73660046117c1565b6114a1565b6000546001600160a01b0316331461051f5760405162461bcd60e51b8152600401610516906118f8565b60405180910390fd5b6001600160a01b03811660009081526001602052604090205460ff166105785760405162461bcd60e51b815260206004820152600e60248201526d139bdd08185d5d1a1bdc9a5e995960921b6044820152606401610516565b6001600160a01b038116600081815260016020526040808220805460ff19169055517f3cec689f527469da1c32e52219a628d3d417c9398fe105d55cb3a628d76762659190a250565b6000546001600160a01b031633146105eb5760405162461bcd60e51b8152600401610516906118f8565b60008181526002602052604090205460ff166106375760405162461bcd60e51b815260206004820152600b60248201526a139bdd08195b98589b195960aa1b6044820152606401610516565b600081815260026020526040808220805460ff191690555182917f6f16a56a321422b0943f17444e22842443899035391e47e74fd2eae02f1070d991a250565b6000546001600160a01b031633146106a15760405162461bcd60e51b8152600401610516906118f8565b600054600160a01b900460ff16156106e85760405162461bcd60e51b815260206004820152600a602482015269139bdd081c185d5cd95960b21b6044820152606401610516565b6000805460ff60a01b1916600160a01b1781556040517f2323cae9119b0fc2495428b41dcb8f1d6571a9f0fb30b4bbd126f235b0ab94509190a1565b6000546001600160a01b0316331461074e5760405162461bcd60e51b8152600401610516906118f8565b600081116107915760405162461bcd60e51b815260206004820152601060248201526f125b9d985b1a590818da185a5b88125160821b6044820152606401610516565b60008181526002602052604090205460ff16156107e25760405162461bcd60e51b815260206004820152600f60248201526e105b1c9958591e48195b98589b1959608a1b6044820152606401610516565b600081815260026020526040808220805460ff191660011790555182917f06e3e2a4832c608c7cd61e48893fbc62b88bc0a48d8bc1f69fd054912b64d7f391a250565b6000546001600160a01b0316331461084f5760405162461bcd60e51b8152600401610516906118f8565b600081116108925760405162461bcd60e51b815260206004820152601060248201526f125b9d985b1a59081a5b9d195c9d985b60821b6044820152606401610516565b60058190556006546040805183815260208101929092527f0936b3616d5072fa8f7381ef8e7c35d39bed9ecfb2184e908a56027ad5c0b6bc91015b60405180910390a150565b6000546001600160a01b031633146109025760405162461bcd60e51b8152600401610516906118f8565b600081116109405760405162461bcd60e51b815260206004820152600b60248201526a496e76616c69642061676560a81b6044820152606401610516565b600681905560055460408051918252602082018390527f0936b3616d5072fa8f7381ef8e7c35d39bed9ecfb2184e908a56027ad5c0b6bc91016108cd565b60008054600160a01b900460ff1661099857506000610a2b565b60008381526002602052604090205460ff166109b657506000610a2b565b60008381526003602090815260408083206001600160a01b038616845290915290205460ff166109e857506000610a2b565b60055460008481526004602090815260408083206001600160a01b0387168452909152902054610a189190611931565b421015610a2757506000610a2b565b5060015b92915050565b60055460008381526004602090815260408083206001600160a01b038616845290915281205490918291610a659190611931565b9050804210610a78576000915050610a2b565b610a824282611944565b949350505050565b6000546001600160a01b03163314610ab45760405162461bcd60e51b8152600401610516906118f8565b600054600160a01b900460ff16610afe5760405162461bcd60e51b815260206004820152600e60248201526d105b1c9958591e481c185d5cd95960921b6044820152606401610516565b6000805460ff60a01b191681556040517f3e56e4347e3d957b715e870e295e543f6d3eedb2a0f77e36fa9036ab1af3bc959190a1565b6000546001600160a01b03163314610b5e5760405162461bcd60e51b8152600401610516906118f8565b60008281526003602090815260408083206001600160a01b038516845290915290205460ff16610bbe5760405162461bcd60e51b815260206004820152600b60248201526a139bdd08195b98589b195960aa1b6044820152606401610516565b60008281526003602090815260408083206001600160a01b0385168085529252808320805460ff1916905551909184917f7ad593f09a6665c184871228603dc064743edbf3bdb4151c625cedb3397e4ff99190a35050565b3360009081526001602052604090205460ff16610c6e5760405162461bcd60e51b81526020600482015260166024820152752737ba1030baba3437b934bd32b2103932b630bcb2b960511b6044820152606401610516565b600054600160a01b900460ff16610cb65760405162461bcd60e51b815260206004820152600c60248201526b14995b185e481c185d5cd95960a21b6044820152606401610516565b60008981526002602052604090205460ff16610d0a5760405162461bcd60e51b815260206004820152601360248201527210da185a5b881b9bdd081cdd5c1c1bdc9d1959606a1b6044820152606401610516565b60008981526003602090815260408083206001600160a01b038c16845290915290205460ff16610d6f5760405162461bcd60e51b815260206004820152601060248201526f141bdbdb081b9bdd08195b98589b195960821b6044820152606401610516565b6000876001600160a01b031611610db85760405162461bcd60e51b815260206004820152600d60248201526c496e76616c696420707269636560981b6044820152606401610516565b60008981526007602090815260408083206001600160a01b03808d1685529252909120805490918681169116148015610e00575060018101546001600160a01b038581169116145b610e3d5760405162461bcd60e51b815260206004820152600e60248201526d0a8ded6cadc40dad2e6dac2e8c6d60931b6044820152606401610516565b42831115610e9857610258610e524285611944565b1115610e935760405162461bcd60e51b815260206004820152601060248201526f04675747572652074696d657374616d760841b6044820152606401610516565b610ee8565b600654610ea58442611944565b1115610ee85760405162461bcd60e51b8152602060048201526012602482015271141c9a58d94819185d18481d1bdbc81bdb1960721b6044820152606401610516565b80600201548211610f305760405162461bcd60e51b815260206004820152601260248201527129ba30b63290313637b1b590373ab6b132b960711b6044820152606401610516565b60055460008b81526004602090815260408083206001600160a01b038e168452909152902054610f609190611931565b421015610faf5760405162461bcd60e51b815260206004820152601a60248201527f52656c617920696e74657276616c206e6f7420656c61707365640000000000006044820152606401610516565b600381015415611028576000610fd282600301548a6001600160a01b03166115c0565b90506113888111156110265760405162461bcd60e51b815260206004820152601860248201527f507269636520646576696174696f6e20746f6f206869676800000000000000006044820152606401610516565b505b60028181018390556001600160a01b038981166003840181905560008d81526004602090815260408083208f86168085529083529281902042908190558151948552958d900b918401919091526001600160801b038b16908301528883166060830152918716608082015260a0810186905260c0810185905260e081019290925233610100830152908b907f75c79671c8187d029ada1a8f8cacf6af122360061d5f3e78d2eb1f00871946f2906101200160405180910390a350505050505050505050565b6000546001600160a01b031633146111175760405162461bcd60e51b8152600401610516906118f8565b6001600160a01b03811661115f5760405162461bcd60e51b815260206004820152600f60248201526e496e76616c6964206164647265737360881b6044820152606401610516565b6000546001600160a01b03908116908216036111aa5760405162461bcd60e51b815260206004820152600a60248201526929b0b6b29037bbb732b960b11b6044820152606401610516565b600080546001600160a01b0319166001600160a01b0392909216919091179055565b6000546001600160a01b031633146111f65760405162461bcd60e51b8152600401610516906118f8565b60008481526002602052604090205460ff1661124a5760405162461bcd60e51b815260206004820152601360248201527210da185a5b881b9bdd081cdd5c1c1bdc9d1959606a1b6044820152606401610516565b6001600160a01b03831661128f5760405162461bcd60e51b815260206004820152600c60248201526b125b9d985b1a59081c1bdbdb60a21b6044820152606401610516565b6001600160a01b038216158015906112af57506001600160a01b03811615155b6112ec5760405162461bcd60e51b815260206004820152600e60248201526d496e76616c696420746f6b656e7360901b6044820152606401610516565b806001600160a01b0316826001600160a01b0316036113425760405162461bcd60e51b81526020600482015260126024820152712a37b5b2b7399036bab9ba103234b33332b960711b6044820152606401610516565b60008481526003602090815260408083206001600160a01b038716845290915290205460ff16156113a75760405162461bcd60e51b815260206004820152600f60248201526e105b1c9958591e48195b98589b1959608a1b6044820152606401610516565b60008481526003602081815260408084206001600160a01b03808916808752918452828620805460ff1916600190811790915583516080810185528983168152888316818701908152818601898152606083018a81528e8b5260078952878b20878c5290985298869020915182549085166001600160a01b0319918216178355905192820180549390941692169190911790915594516002860155915193909201929092555185907f13ea0230134d185ab081f399887466713fd79cf905fdfee5447a583a2f5e11329061149390869086906001600160a01b0392831681529116602082015260400190565b60405180910390a350505050565b6000546001600160a01b031633146114cb5760405162461bcd60e51b8152600401610516906118f8565b6001600160a01b0381166115135760405162461bcd60e51b815260206004820152600f60248201526e496e76616c6964206164647265737360881b6044820152606401610516565b6001600160a01b03811660009081526001602052604090205460ff16156115715760405162461bcd60e51b8152602060048201526012602482015271105b1c9958591e48185d5d1a1bdc9a5e995960721b6044820152606401610516565b6001600160a01b0381166000818152600160208190526040808320805460ff1916909217909155517f34aff43ff674361fe2288d5bfdd1c3ee4c20de76d41536ac0e195c6b59552ff59190a250565b6000826000036115d257506000610a2b565b60006115dd84611644565b905060006115ea84611644565b9050816000036115ff57600092505050610a2b565b6000818311611617576116128383611944565b611621565b6116218284611944565b90508261163082612710611957565b61163a919061196e565b9695505050505050565b6000600160c01b61165683808361165d565b9392505050565b60008080600019858709858702925082811083820303915050806000036116c757600084116116bc5760405162461bcd60e51b815260206004820152600b60248201526a446976206279207a65726f60a81b6044820152606401610516565b508290049050611656565b8084116117015760405162461bcd60e51b81526020600482015260086024820152674f766572666c6f7760c01b6044820152606401610516565b600084868809600260036001881981018916988990049182028318808302840302808302840302808302840302808302840302808302840302918202909203026000889003889004909101858311909403939093029303949094049190911702949350505050565b6001600160a01b038116811461177e57600080fd5b50565b803561178c81611769565b919050565b600080604083850312156117a457600080fd5b8235915060208301356117b681611769565b809150509250929050565b6000602082840312156117d357600080fd5b813561165681611769565b6000602082840312156117f057600080fd5b5035919050565b60008060008060008060008060006101208a8c03121561181657600080fd5b8935985060208a013561182881611769565b975060408a013561183881611769565b965060608a0135600281900b811461184f57600080fd5b955060808a01356001600160801b038116811461186b57600080fd5b945061187960a08b01611781565b935061188760c08b01611781565b925060e08a013591506101008a013590509295985092959850929598565b600080600080608085870312156118bb57600080fd5b8435935060208501356118cd81611769565b925060408501356118dd81611769565b915060608501356118ed81611769565b939692955090935050565b6020808252600990820152682737ba1037bbb732b960b91b604082015260600190565b634e487b7160e01b600052601160045260246000fd5b80820180821115610a2b57610a2b61191b565b81810381811115610a2b57610a2b61191b565b8082028115828204841417610a2b57610a2b61191b565b60008261198b57634e487b7160e01b600052601260045260246000fd5b50049056fea26469706673582212203941a72cfa6e582828cf8d48612326cd8c5a0c1df5dc144478473ff7c5bf0d2064736f6c63430008130033" as `0x\${string}`;
