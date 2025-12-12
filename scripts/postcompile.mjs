import fs from "node:fs";
import path from "node:path";

/**
 * postcompile.mjs
 *
 * Goal: make contract ABI/bytecode generation reliable for forks.
 *
 * - Copies selected Hardhat artifacts to the repo-level `artifacts/` folder (legacy behavior used by scripts).
 * - Generates TypeScript artifacts consumed by the Next.js frontend in `frontend/src/lib/artifacts/`.
 *
 * This avoids hand-maintaining huge bytecode strings in the frontend.
 */

const ROOT = process.cwd();
const HARDHAT_ARTIFACTS_DIR = path.join(ROOT, "artifacts", "contracts");
const FLAT_ARTIFACTS_DIR = path.join(ROOT, "artifacts");
const FRONTEND_ARTIFACTS_DIR = path.join(
  ROOT,
  "frontend",
  "src",
  "lib",
  "artifacts"
);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(p, contents) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, contents);
}

function renderTsArtifact({ sourceName, abi, bytecode, exports, extraTs }) {
  const header = `// Auto-generated from Hardhat artifact\n// ${sourceName}\n\n`;
  const abiConst = `export const ${exports.abi} = ${JSON.stringify(abi, null, 2)} as const;\n\n`;
  const bytecodeConst = `export const ${exports.bytecode} = ${JSON.stringify(
    bytecode
  )} as \`0x\\\${string}\`;\n`;

  return header + abiConst + bytecodeConst + (extraTs ? `\n${extraTs}\n` : "");
}

function copyFlatArtifact({ contractName }) {
  const src = path.join(
    HARDHAT_ARTIFACTS_DIR,
    `${contractName}.sol`,
    `${contractName}.json`
  );
  const dst = path.join(FLAT_ARTIFACTS_DIR, `${contractName}.json`);
  const json = readJson(src);
  writeFile(dst, JSON.stringify(json, null, 2) + "\n");
}

function generateFrontendArtifact({ contractName, outFile, exports, extraTs }) {
  const src = path.join(
    HARDHAT_ARTIFACTS_DIR,
    `${contractName}.sol`,
    `${contractName}.json`
  );
  const json = readJson(src);

  const rendered = renderTsArtifact({
    sourceName: json.sourceName,
    abi: json.abi,
    bytecode: json.bytecode,
    exports,
    extraTs,
  });

  writeFile(path.join(FRONTEND_ARTIFACTS_DIR, outFile), rendered);
}

// Extra frontend-only constants that are not part of the Solidity artifact.
const CONTRACT_REGISTRY_EXTRA_TS = `// ContractRegistry addresses - used to look up FdcVerification dynamically\nexport const CONTRACT_REGISTRY = {\n  // Flare Mainnet (chainId 14)\n  14: \"0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019\" as \`0x\\\${string}\`,\n  // Coston2 Testnet (chainId 114)\n  114: \"0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019\" as \`0x\\\${string}\`,\n} as const;\n\n// ABI for ContractRegistry to fetch FdcVerification address\nexport const CONTRACT_REGISTRY_ABI = [\n  {\n    inputs: [{ internalType: \"string\", name: \"_name\", type: \"string\" }],\n    name: \"getContractAddressByName\",\n    outputs: [{ internalType: \"address\", name: \"\", type: \"address\" }],\n    stateMutability: \"view\",\n    type: \"function\",\n  },\n] as const;`;

function main() {
  // Ensure dirs exist
  ensureDir(FLAT_ARTIFACTS_DIR);
  ensureDir(FRONTEND_ARTIFACTS_DIR);

  // Keep legacy flat JSON artifacts used by node scripts
  copyFlatArtifact({ contractName: "PriceRecorder" });
  copyFlatArtifact({ contractName: "PoolPriceCustomFeed" });
  copyFlatArtifact({ contractName: "CrossChainPoolPriceCustomFeed" });
  copyFlatArtifact({ contractName: "PriceRelay" });

  // Generate frontend TS artifacts (ABI + bytecode)
  generateFrontendArtifact({
    contractName: "PriceRecorder",
    outFile: "PriceRecorder.ts",
    exports: { abi: "PRICE_RECORDER_ABI", bytecode: "PRICE_RECORDER_BYTECODE" },
  });

  generateFrontendArtifact({
    contractName: "PoolPriceCustomFeed",
    outFile: "PoolPriceCustomFeed.ts",
    exports: {
      abi: "POOL_PRICE_CUSTOM_FEED_ABI",
      bytecode: "POOL_PRICE_CUSTOM_FEED_BYTECODE",
    },
    extraTs: CONTRACT_REGISTRY_EXTRA_TS,
  });

  generateFrontendArtifact({
    contractName: "PriceRelay",
    outFile: "PriceRelay.ts",
    exports: { abi: "PRICE_RELAY_ABI", bytecode: "PRICE_RELAY_BYTECODE" },
  });

  generateFrontendArtifact({
    contractName: "CrossChainPoolPriceCustomFeed",
    outFile: "CrossChainPoolPriceCustomFeed.ts",
    exports: {
      abi: "CROSSCHAIN_POOL_PRICE_CUSTOM_FEED_ABI",
      bytecode: "CROSSCHAIN_POOL_PRICE_CUSTOM_FEED_BYTECODE",
    },
  });

  // Keep frontend/src/lib/artifacts/index.ts as the stable hand-authored export surface.
  console.log(
    `[postcompile] Wrote frontend artifacts to: ${FRONTEND_ARTIFACTS_DIR}`
  );
  console.log(`[postcompile] Copied flat artifacts to: ${FLAT_ARTIFACTS_DIR}`);
}

main();

