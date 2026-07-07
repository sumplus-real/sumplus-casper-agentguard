/**
 * IKA dWallet Network Skill
 *
 * IKA is a Zero-Trust Threshold Signature Network enabling Web3 developers
 * to build protocols operating across blockchains with zero-trust security.
 * The core primitive is the **dWallet** — a programmable, non-collusive,
 * massively decentralized signing mechanism enforcing cryptographic user consent.
 *
 * Architecture: IKA runs on its own consensus network (forked from Sui) with
 * native coordination on Sui via DWalletCoordinator shared objects. It uses a
 * novel 2PC-MPC protocol where signing requires both the user AND a 2/3+1
 * threshold of hundreds of permissionless network nodes.
 *
 * SDK: @ika.xyz/sdk (TypeScript)
 * Move: Sui Move contract integration via ika_dwallet_coordinator package
 * Network: https://ika.xyz | Docs: https://docs.ika.xyz
 *
 * [ARSENAL-HOSTED ✓] Reference skill — no API key or RPC needed.
 */

import type { SkillExecutionResult } from '@/types/skill';

// ─── Protocol Info ────────────────────────────────────────────────────────────

function actionGetProtocolInfo(): SkillExecutionResult {
  return {
    success: true,
    output: {
      name: 'IKA dWallet Network',
      tagline: 'Zero-Trust Threshold Signature Network for Multi-Chain Web3',
      website: 'https://ika.xyz',
      docs: 'https://docs.ika.xyz',
      github: 'https://github.com/dwallet-labs/ika',
      sdk_package: '@ika.xyz/sdk',

      what_is_ika: [
        'IKA is a decentralized platform for building protocols that operate across blockchains with zero-trust security.',
        'The core primitive is the dWallet — a non-collusive, massively decentralized signing mechanism.',
        "Unlike bridges, dWallets generate native signatures for any blockchain (Bitcoin, Ethereum, Solana, etc.) directly from within Sui smart contracts.",
        'IKA implements 2PC-MPC: Two-Party Computation where the second party is emulated by hundreds of network nodes.',
      ],

      dwallet_properties: {
        non_collusive: 'User is always required to generate a signature — the network alone cannot sign',
        massively_decentralized: '2/3+1 threshold of hundreds of permissionless nodes required alongside the user',
        programmable: 'Define on-chain logic governing when signatures are created (DAOs, multi-sig, DeFi)',
        transferable: 'dWallet ownership can be transferred, enabling marketplaces and future user claims',
        multi_chain: 'Native interoperability via blockchain signatures — no bridge risks',
        universal_signing: 'ECDSA, Taproot, EdDSA, Schnorr support across BTC/ETH/SOL/Polkadot and more',
      },

      protocol_architecture: {
        ika_network: 'Standalone consensus network (forked from Sui) implementing 2PC-MPC',
        sui_coordination: 'DWalletCoordinator shared object on Sui manages protocol state and fee collection',
        ika_token: 'Protocol fee token + authority stake delegation',
        consensus: 'Sui Mysticeti consensus for MPC communication (O(n) communication, O(1) amortized per node)',
      },

      key_use_cases: [
        'Multi-chain DeFi: Sui smart contracts controlling Bitcoin/Ethereum assets natively',
        'DAO Treasuries: Decentralized governance controlling cross-chain wallets',
        'Decentralized Custody: Non-custodial key management with programmable access control',
        'Cross-chain DEX: Order books spanning multiple L1s without bridging',
        'Wallet Migration: Import existing BTC/ETH keys into the dWallet system',
        'Automated Trading Bots: Smart contract-controlled signing with risk parameters',
      ],

      fee_structure: {
        note: 'Operations require payment in both IKA (protocol fees) and SUI (transaction gas)',
        ika_fees: 'DKG, presign, and sign operations each consume IKA tokens',
        sui_gas: 'Standard Sui gas fees for Move transaction execution',
      },
    },
  };
}

// ─── SDK Reference ────────────────────────────────────────────────────────────

function actionGetSdkReference(): SkillExecutionResult {
  return {
    success: true,
    output: {
      installation: {
        npm: 'pnpm add @ika.xyz/sdk  # or npm/yarn/bun',
        from_source: [
          'git clone https://github.com/dwallet-labs/ika.git',
          'cd sdk/typescript && pnpm install && pnpm build',
          'Add to package.json: "@ika.xyz/sdk": "file:../sdk/typescript/dist"',
        ],
        prerequisites_from_source: ['Rust toolchain', 'Sui CLI', 'pnpm', 'wasm-pack', 'wasm-bindgen-cli@0.2.100'],
      },

      ika_client: {
        description: 'IkaClient is the main entry point — wraps a Sui client with dWallet-specific query and configuration methods.',
        initialization: `import { IkaClient, IkaClientConfig } from '@ika.xyz/sdk';

const ikaClient = new IkaClient({
  suiClient,  // SuiClient instance configured for testnet/mainnet
});
// Or auto-initialize on first use — explicit init also available`,

        key_objects: {
          dwalletCoordinatorId: 'ikaClient.config.objects.dwalletCoordinatorId — Sui shared object ID for DWalletCoordinator',
          networkEncryptionKey: 'await ikaClient.getLatestNetworkEncryptionKey() — current network encryption key',
          currentEpoch: 'await ikaClient.getCurrentEpoch()',
          protocolPublicParams: 'await ikaClient.getProtocolPublicParams(curve)',
        },

        query_methods: {
          getDWallet: 'await ikaClient.getDWallet(dwalletId) — fetch single dWallet by ID',
          getDWallets: 'await ikaClient.getDWallets([id1, id2]) — batch fetch multiple dWallets',
          getOwnedDWalletCaps: 'await ikaClient.getOwnedDWalletCaps(ownerAddress, { limit, cursor }) — paginated',
          getPresignSessions: 'await ikaClient.getPresignSessions(dwalletId) — fetch presign sessions',
          waitForDWalletActive: 'await ikaClient.waitForDWalletActive(dwalletId, { timeout, interval }) — poll until active',
          getEncryptionKeyForAddress: 'await ikaClient.getEncryptionKeyForAddress(address)',
          getLatestNetworkEncryptionKey: 'await ikaClient.getLatestNetworkEncryptionKey()',
          getNetworkEncryptionKeys: 'await ikaClient.getNetworkEncryptionKeys() — all network keys',
        },

        cache_management: {
          invalidateAll: 'ikaClient.invalidateAllCaches()',
          invalidateObjects: 'ikaClient.invalidateObjectCache()',
          invalidateEncryptionKeys: 'ikaClient.invalidateEncryptionKeyCache()',
          invalidateProtocolParams: 'ikaClient.invalidateProtocolParamsCache(curve)',
        },
      },

      ika_transaction: {
        description: 'IkaTransaction wraps a Sui Transaction with dWallet-specific operations. Must be initialized with UserShareEncryptionKeys.',
        initialization: `import { IkaTransaction, UserShareEncryptionKeys } from '@ika.xyz/sdk';

// Create encryption keys from a root seed
const encryptionKeys = await UserShareEncryptionKeys.fromRootSeed(rootSeed, ikaClient);
const tx = new IkaTransaction(encryptionKeys);`,

        core_operations: {
          registerEncryptionKey: 'tx.registerEncryptionKey() — register user encryption key with network (required before DKG)',
          requestDWalletDKG: 'tx.requestDWalletDKG({ curve, encryptionKeyId, ... }) — create Zero-Trust dWallet',
          requestDWalletDKGWithPublicUserShare: 'tx.requestDWalletDKGWithPublicUserShare({ curve, ... }) — create Shared dWallet',
          acceptEncryptedUserShare: 'tx.acceptEncryptedUserShare(dwalletCapId) — activate dWallet after DKG (Zero-Trust only)',
          requestPresign: 'tx.requestPresign(dwalletCapId) — dWallet-specific presign (required for ECDSA imported keys)',
          requestGlobalPresign: 'tx.requestGlobalPresign({ dWalletNetworkEncryptionKeyId }) — global presign for any dWallet',
          verifyPresignCap: 'tx.verifyPresignCap(unverifiedPresignCapId) — verify presign capability',
          sign: 'tx.sign({ dwalletCapId, presignCapId, message, ... }) — create signature',
          importKey: 'tx.importKey({ privateKey, curve, ... }) — import existing private key as dWallet',
        },

        sign_during_dkg: {
          description: 'Optionally combine dWallet creation + signing in a single transaction',
          usage: 'Pass signDuringDKGRequest param to requestDWalletDKG() or requestDWalletDKGWithPublicUserShare()',
        },
      },

      user_share_encryption_keys: {
        description: 'Manages the user-side cryptographic material for Zero-Trust dWallets.',
        create: 'await UserShareEncryptionKeys.fromRootSeed(rootSeed, ikaClient)',
        purpose: 'Encrypts and decrypts the user secret share — required for signing with Zero-Trust dWallets',
        storage_note: 'The root seed should be securely stored by the user — loss means inability to sign',
      },
    },
  };
}

// ─── dWallet Types ────────────────────────────────────────────────────────────

function actionGetDwalletTypes(): SkillExecutionResult {
  return {
    success: true,
    output: {
      overview: 'IKA supports three dWallet types, each splitting the private key into two cryptographic shares (user share + network share) using 2PC-MPC.',

      types: {
        zero_trust: {
          name: 'Zero-Trust dWallet',
          user_share: 'ENCRYPTED — only you can decrypt it',
          network_share: 'Held by IKA network (2/3+ threshold)',
          signing: 'Requires user to provide decrypted share for every signature',
          trust_model: 'Network CANNOT sign without explicit user consent',
          best_for: ['User-controlled wallets', 'Custody solutions', 'Regulatory compliance', 'Maximum security scenarios'],
          creation_method: 'requestDWalletDKG() via IkaTransaction',
          activation: 'Must call acceptEncryptedUserShare() after DKG completes',
          sdk_note: 'Requires UserShareEncryptionKeys from a root seed',
        },

        shared: {
          name: 'Shared dWallet',
          user_share: 'PUBLICLY stored on-chain (not encrypted)',
          network_share: 'Held by IKA network',
          signing: 'Network can sign autonomously — no user interaction required',
          trust_model: 'Network has access to both shares — trust in network operations required',
          best_for: ['DAO treasuries', 'Smart contract-controlled wallets', 'Automated trading systems', 'Protocol-owned liquidity'],
          creation_method: 'requestDWalletDKGWithPublicUserShare() via IkaTransaction',
          activation: 'No acceptEncryptedUserShare needed — activates directly',
          move_recommended: 'This type is recommended for Move contract integrations',
        },

        imported_key: {
          name: 'Imported Key dWallet',
          user_share: 'Split from an EXISTING private key (configurable as Zero-Trust or Shared)',
          network_share: 'Held by IKA network',
          signing: 'Same as chosen mode (Zero-Trust or Shared)',
          trust_model: 'Depends on mode; note original key still exists outside dWallet system',
          best_for: ['Migrating existing BTC/ETH keys', 'Cross-chain operations with existing key material', 'Wallet recovery', 'Legacy system integration'],
          creation_method: 'importKey() via IkaTransaction',
          security_warning: 'Original private key is NOT destroyed — if already compromised, dWallet provides no additional security. For new wallets, prefer DKG-created Zero-Trust type.',
          presign_note: 'ECDSA imported key dWallets require dWallet-specific presigns (not global presigns)',
          conversion: 'Can convert Zero-Trust imported key to Shared — but this is IRREVERSIBLE',
        },
      },

      comparison_table: [
        { property: 'User control', zero_trust: '✅ Full', shared: '❌ Delegated to network', imported: '✅/❌ Depends on mode' },
        { property: 'Autonomous signing', zero_trust: '❌ User needed', shared: '✅ Yes', imported: '✅/❌ Depends on mode' },
        { property: 'Move contract friendly', zero_trust: '⚠️ Complex', shared: '✅ Yes', imported: '✅/❌ Depends on mode' },
        { property: 'Security level', zero_trust: '🔒 Maximum', shared: '🔐 Trust network', imported: '🔑 Depends on original key hygiene' },
        { property: 'Use existing key', zero_trust: '❌ No', shared: '❌ No', imported: '✅ Yes' },
      ],
    },
  };
}

// ─── Move Integration Reference ───────────────────────────────────────────────

function actionGetMoveReference(): SkillExecutionResult {
  return {
    success: true,
    output: {
      overview: 'IKA provides a Sui Move package (ika_dwallet_coordinator) enabling dWallet operations within smart contracts. Best suited for Shared dWallets enabling autonomous signing.',

      when_to_use: {
        use_move: ['DAOs or treasuries requiring distributed signing authority', 'Governance systems with approval workflows before signing', 'Multi-signature wallets with custom voting logic', 'Automated trading bots or DeFi protocols signing on other chains', 'Custody solutions with programmable access controls'],
        use_sdk_only: ['User-facing wallets where users hold their own keys', 'Simple signing flows without on-chain logic', 'Prototyping before committing to on-chain architecture'],
      },

      project_setup: {
        create: 'sui move new my_ika_project && cd my_ika_project',
        move_toml: `[package]
name = "my_ika_project"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }
Ika = { git = "https://github.com/dwallet-labs/ika.git", subdir = "crates/ika-framework/packages/ika-framework", rev = "main" }`,
        verify: 'sui move build',
      },

      core_objects: {
        DWalletCoordinator: {
          description: 'Shared object — central coordinator for all dWallet operations on Ika network',
          access: '&mut DWalletCoordinator for write ops (DKG, presign, sign); &DWalletCoordinator for read-only queries',
          get_id: 'ikaClient.config.objects.dwalletCoordinatorId (from TypeScript SDK)',
        },
        DWalletCap: {
          description: 'Capability object authorizing signing operations for a specific dWallet',
          lifecycle: 'Created by DKG → stored in your contract → passed to approve_message() and request_sign()',
        },
        UnverifiedPresignCap: {
          description: 'Pre-computed cryptographic nonce material — must be verified before signing',
          lifecycle: 'REQUEST (requestPresign/requestGlobalPresign) → VERIFY (verifyPresignCap) → CONSUME (destroyed during sign)',
        },
        VerifiedPresignCap: {
          description: 'Network-validated presign — ready for use in signing',
          note: 'Single-use — destroyed when signing. Maintain a pool for uninterrupted signing.',
        },
        MessageApproval: {
          description: 'On-chain authorization for signing a specific message — created via approve_message()',
          note: 'Enforces programmable conditions before any signature is generated',
        },
        SessionIdentifier: {
          description: 'Unique identifier for each protocol operation — prevents replay attacks',
          create: 'coordinator.create_session_identifier(ctx)',
        },
      },

      protocols: {
        dkg: {
          name: 'Distributed Key Generation',
          purpose: 'Create a new dWallet — distributes key shares between user and IKA network',
          shared_dwallet_function: `public fun request_dwallet_dkg_with_public_user_secret_key_share(
    self: &mut DWalletCoordinator,
    dwallet_network_encryption_key_id: ID,
    curve: u32,                                    // 0=SECP256K1, 1=SECP256R1, 2=ED25519, 3=RISTRETTO
    centralized_public_key_share_and_proof: vector<u8>,
    user_public_output: vector<u8>,
    public_user_secret_key_share: vector<u8>,
    sign_during_dkg_request: Option<SignDuringDKGRequest>,
    session_identifier: SessionIdentifier,
    payment_ika: &mut Coin<IKA>,
    payment_sui: &mut Coin<SUI>,
    ctx: &mut TxContext,
): (DWalletCap, Option<ID>)`,
          result: 'DWalletCap stored in your contract for future signing operations',
          typescript_prep: 'Use IkaTransaction.requestDWalletDKGWithPublicUserShare() to prepare cryptographic parameters',
        },

        presigning: {
          name: 'Presigning',
          purpose: 'Pre-compute cryptographic nonces (required before every signature)',
          global_function: `public fun request_global_presign(
    self: &mut DWalletCoordinator,
    dwallet_network_encryption_key_id: ID,
    session_identifier: SessionIdentifier,
    payment_ika: &mut Coin<IKA>,
    payment_sui: &mut Coin<SUI>,
    ctx: &mut TxContext,
): UnverifiedPresignCap`,
          verify_function: `public fun verify_presign_cap(
    self: &mut DWalletCoordinator,
    presign_cap: UnverifiedPresignCap,
    session_identifier: SessionIdentifier,
    ctx: &mut TxContext,
): VerifiedPresignCap`,
          pool_recommendation: 'Maintain multiple pre-verified presigns. Each sign consumes one. Auto-replenish when pool level drops.',
          ecdsa_imported_note: 'ECDSA signatures with imported key dWallets require dWallet-specific presigns (requestPresign), not global presigns.',
        },

        signing: {
          name: 'Signing',
          purpose: 'Generate a cross-chain signature (e.g. Bitcoin TX, Ethereum TX)',
          approve_message: `// Standard dWallet:
let approval = coordinator.approve_message(
    &dwallet_cap,
    signature_algorithm,  // 0=ECDSA, 1=Taproot, 4=EdDSA
    hash_scheme,           // 0=SHA256, 1=KECCAK256
    message,               // tx hash bytes
);

// Imported key dWallet:
let approval = coordinator.approve_imported_key_message(
    &imported_dwallet_cap, signature_algorithm, hash_scheme, message
);`,
          request_sign: `public fun request_sign(
    self: &mut DWalletCoordinator,
    presign_cap: VerifiedPresignCap,
    message_approval: MessageApproval,
    message_centralized_signature: vector<u8>,   // user's partial signature from SDK
    session_identifier: SessionIdentifier,
    payment_ika: &mut Coin<IKA>,
    payment_sui: &mut Coin<SUI>,
    ctx: &mut TxContext,
)
// Variant returning ID for tracking: request_sign_and_return_id(...)`,
          signature_algorithm_values: { ECDSA: 0, Taproot: 1, EdDSA: 4 },
          hash_scheme_values: { SHA256: 0, KECCAK256: 1, DoubleSHA256: 2, SHA512: 3, Merlin: 4 },
        },

        future_signing: {
          name: 'Future Signing',
          purpose: 'Two-phase signing: commit to a message now, reveal and sign later',
          use_case: 'Useful for time-locked transactions, commit-reveal schemes, or deferred execution',
        },
      },

      integration_pattern: {
        description: 'Typical contract structure for a DAO treasury',
        struct_fields: `struct Treasury has key {
    id: UID,
    dwallet_cap: DWalletCap,
    presign_pool: vector<UnverifiedPresignCap>,
    ika_balance: Balance<IKA>,
    sui_balance: Balance<SUI>,
    network_encryption_key_id: ID,
}`,
        flow: [
          '1. Members vote to approve a cross-chain transaction',
          '2. Contract calls approve_message() to create MessageApproval',
          '3. Consume a VerifiedPresignCap from pool',
          '4. Call request_sign() with the approval, presign, and TypeScript-provided centralized signature',
          '5. IKA network processes and emits the final signature',
          '6. Replenish presign pool as needed',
        ],
      },

      typescript_integration: {
        client_setup: `import { IkaClient, SuiClient } from '@ika.xyz/sdk';
const suiClient = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
const ikaClient = new IkaClient({ suiClient });`,
        get_coordinator_id: `const coordinatorId = ikaClient.config.objects.dwalletCoordinatorId;`,
        get_network_key: `const networkKey = await ikaClient.getLatestNetworkEncryptionKey();`,
      },
    },
  };
}

// ─── Cryptographic Primitives ─────────────────────────────────────────────────

function actionGetCryptoPrimitives(): SkillExecutionResult {
  return {
    success: true,
    output: {
      overview: 'IKA supports multi-chain signing through a comprehensive set of cryptographic primitives covering the major blockchain ecosystems.',

      curves: [
        { id: 0, name: 'SECP256K1', sdk_enum: 'Curve.SECP256K1', key_size_bits: 256, used_by: ['Bitcoin', 'Ethereum', 'Most EVM chains'] },
        { id: 1, name: 'SECP256R1', sdk_enum: 'Curve.SECP256R1', key_size_bits: 256, used_by: ['NIST P-256', 'WebAuthn', 'Enterprise systems', 'Passkeys'] },
        { id: 2, name: 'ED25519', sdk_enum: 'Curve.ED25519', key_size_bits: 256, used_by: ['Solana', 'Modern systems', 'Sui'] },
        { id: 3, name: 'RISTRETTO', sdk_enum: 'Curve.RISTRETTO', key_size_bits: 256, used_by: ['Polkadot', 'Substrate chains'] },
      ],

      signature_algorithms: [
        { id: 0, name: 'ECDSASecp256k1', move_value: 0, compatible_hashes: ['KECCAK256', 'SHA256', 'DoubleSHA256'], use_for: 'Bitcoin, Ethereum, EVM chains' },
        { id: 1, name: 'Taproot', move_value: 1, compatible_hashes: ['SHA256'], use_for: 'Bitcoin Taproot / Schnorr signatures' },
        { id: 2, name: 'ECDSASecp256r1', move_value: 2, compatible_hashes: ['SHA256'], use_for: 'P-256, WebAuthn, Passkeys' },
        { id: 4, name: 'EdDSA', move_value: 4, compatible_hashes: ['SHA512'], use_for: 'Solana, Ed25519-based chains' },
        { id: 5, name: 'SchnorrkelSubstrate', move_value: 5, compatible_hashes: ['Merlin'], use_for: 'Polkadot, Substrate-based chains' },
      ],

      hash_schemes: [
        { id: 0, name: 'SHA256', move_value: 0, use_for: 'Bitcoin, general-purpose signing, Taproot' },
        { id: 1, name: 'KECCAK256', move_value: 1, use_for: 'Ethereum transactions, EVM chains' },
        { id: 2, name: 'DoubleSHA256', move_value: 2, use_for: 'Legacy Bitcoin' },
        { id: 3, name: 'SHA512', move_value: 3, use_for: 'EdDSA signatures, Ed25519 chains' },
        { id: 4, name: 'Merlin', move_value: 4, use_for: 'Substrate-based chains (Polkadot, Kusama)' },
      ],

      chain_selection_guide: {
        bitcoin: { curve: 'SECP256K1', algorithm: 'ECDSASecp256k1 or Taproot', hash: 'SHA256 or DoubleSHA256' },
        ethereum_evm: { curve: 'SECP256K1', algorithm: 'ECDSASecp256k1', hash: 'KECCAK256' },
        solana: { curve: 'ED25519', algorithm: 'EdDSA', hash: 'SHA512' },
        polkadot: { curve: 'RISTRETTO', algorithm: 'SchnorrkelSubstrate', hash: 'Merlin' },
        webauthn: { curve: 'SECP256R1', algorithm: 'ECDSASecp256r1', hash: 'SHA256' },
      },

      move_constants: `// In Move contracts:
const ECDSA_SECP256K1: u32 = 0;
const TAPROOT: u32 = 1;
const ECDSA_SECP256R1: u32 = 2;
const EDDSA: u32 = 4;

const SHA256: u8 = 0;
const KECCAK256: u8 = 1;
const DOUBLE_SHA256: u8 = 2;
const SHA512: u8 = 3;
const MERLIN: u8 = 4;`,
    },
  };
}

// ─── Code Examples ────────────────────────────────────────────────────────────

function actionGetCodeExample(input: any): SkillExecutionResult {
  const { example } = input ?? {};

  const examples: Record<string, object> = {
    // Example 1: Create a Zero-Trust dWallet
    zero_trust_dwallet: {
      description: 'Complete flow to create a Zero-Trust dWallet and sign a message',
      language: 'TypeScript',
      code: `import { IkaClient, IkaTransaction, UserShareEncryptionKeys, Curve } from '@ika.xyz/sdk';
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

async function createZeroTrustDWallet() {
  // 1. Setup clients
  const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
  const ikaClient = new IkaClient({ suiClient });
  const keypair = Ed25519Keypair.fromSecretKey(/* your key bytes */);
  const signer = keypair.getPublicKey().toSuiAddress();

  // 2. Create encryption keys from a root seed (store this seed securely!)
  const rootSeed = crypto.getRandomValues(new Uint8Array(32));
  const encryptionKeys = await UserShareEncryptionKeys.fromRootSeed(rootSeed, ikaClient);

  // 3. Create a transaction to register encryption key + run DKG
  const tx = new IkaTransaction(encryptionKeys);
  const encKeyId = tx.registerEncryptionKey();
  const { dwalletCap, dwalletCapId } = await tx.requestDWalletDKG({
    curve: Curve.SECP256K1,
    encryptionKeyId: encKeyId,
  });

  // Transfer the dWalletCap to our signer
  tx.transferObjects([dwalletCap], signer);
  const result = await suiClient.signAndExecuteTransaction({ transaction: tx, signer: keypair });

  // 4. Wait for the dWallet to become active
  const dwallet = await ikaClient.waitForDWalletActive(dwalletCapId);

  // 5. Accept the encrypted user share (activates the dWallet)
  const tx2 = new IkaTransaction(encryptionKeys);
  await tx2.acceptEncryptedUserShare(dwalletCapId);
  await suiClient.signAndExecuteTransaction({ transaction: tx2, signer: keypair });

  console.log('Zero-Trust dWallet created:', dwallet.id);
  return { dwallet, encryptionKeys };
}`,
    },

    // Example 2: Create a Shared dWallet (Move-friendly)
    shared_dwallet: {
      description: 'Create a Shared dWallet suitable for DAO/smart contract use',
      language: 'TypeScript',
      code: `import { IkaClient, IkaTransaction, UserShareEncryptionKeys, Curve } from '@ika.xyz/sdk';

async function createSharedDWallet(ikaClient, suiClient, keypair) {
  const signer = keypair.getPublicKey().toSuiAddress();

  // Shared dWallets use a root seed too — but the user share is public
  const rootSeed = crypto.getRandomValues(new Uint8Array(32));
  const encryptionKeys = await UserShareEncryptionKeys.fromRootSeed(rootSeed, ikaClient);

  const tx = new IkaTransaction(encryptionKeys);
  const encKeyId = tx.registerEncryptionKey();

  // requestDWalletDKGWithPublicUserShare — user share stored publicly on-chain
  const { dwalletCap, dwalletCapId } = await tx.requestDWalletDKGWithPublicUserShare({
    curve: Curve.SECP256K1,
    encryptionKeyId: encKeyId,
  });

  tx.transferObjects([dwalletCap], signer);
  await suiClient.signAndExecuteTransaction({ transaction: tx, signer: keypair });

  // Wait for active — no acceptEncryptedUserShare needed for Shared type
  const dwallet = await ikaClient.waitForDWalletActive(dwalletCapId);
  console.log('Shared dWallet created:', dwallet.id);
  return dwallet;
}`,
    },

    // Example 3: Import an existing private key
    import_key: {
      description: 'Import an existing Bitcoin/Ethereum private key as a dWallet',
      language: 'TypeScript',
      code: `import { IkaClient, IkaTransaction, UserShareEncryptionKeys, Curve, SignatureAlgorithm } from '@ika.xyz/sdk';

async function importPrivateKey(ikaClient, suiClient, keypair, existingPrivateKeyHex) {
  const signer = keypair.getPublicKey().toSuiAddress();
  const rootSeed = crypto.getRandomValues(new Uint8Array(32));
  const encryptionKeys = await UserShareEncryptionKeys.fromRootSeed(rootSeed, ikaClient);

  const tx = new IkaTransaction(encryptionKeys);
  const encKeyId = tx.registerEncryptionKey();

  // Import existing key — creates an Imported Key dWallet (Zero-Trust by default)
  const { importedDwalletCap, importedDwalletCapId } = await tx.importKey({
    privateKey: Buffer.from(existingPrivateKeyHex, 'hex'),
    curve: Curve.SECP256K1,
    signatureAlgorithm: SignatureAlgorithm.ECDSASecp256k1,
    encryptionKeyId: encKeyId,
    // Optional: shareMode: 'shared'  — makes it a Shared imported dWallet (irreversible!)
  });

  tx.transferObjects([importedDwalletCap], signer);
  await suiClient.signAndExecuteTransaction({ transaction: tx, signer: keypair });

  const dwallet = await ikaClient.waitForDWalletActive(importedDwalletCapId);
  console.log('Imported Key dWallet created:', dwallet.id);
  // WARNING: Original private key still exists outside dWallet. Rotate/delete it if possible.
  return dwallet;
}`,
    },

    // Example 4: Presign and Sign
    presign_and_sign: {
      description: 'Full presign + sign flow for signing a cross-chain transaction',
      language: 'TypeScript',
      code: `import { IkaClient, IkaTransaction, UserShareEncryptionKeys, SignatureAlgorithm, HashScheme } from '@ika.xyz/sdk';

async function signEthereumTransaction(ikaClient, suiClient, keypair, dwalletCapId, ethTxHash, encryptionKeys) {
  // 1. Request a Global Presign (can be done ahead of time, pooled)
  const networkKey = await ikaClient.getLatestNetworkEncryptionKey();
  const tx1 = new IkaTransaction(encryptionKeys);
  const { unverifiedPresignCap } = await tx1.requestGlobalPresign({
    dWalletNetworkEncryptionKeyId: networkKey.id,
  });
  await suiClient.signAndExecuteTransaction({ transaction: tx1, signer: keypair });

  // 2. Verify the presign cap
  const tx2 = new IkaTransaction(encryptionKeys);
  const { verifiedPresignCap, verifiedPresignCapId } = await tx2.verifyPresignCap(unverifiedPresignCap);
  await suiClient.signAndExecuteTransaction({ transaction: tx2, signer: keypair });

  // 3. Sign the Ethereum transaction hash (ECDSA + KECCAK256)
  const tx3 = new IkaTransaction(encryptionKeys);
  const signature = await tx3.sign({
    dwalletCapId,
    presignCapId: verifiedPresignCapId,
    message: ethTxHash,      // 32-byte Ethereum tx hash
    signatureAlgorithm: SignatureAlgorithm.ECDSASecp256k1,
    hashScheme: HashScheme.KECCAK256,
  });
  await suiClient.signAndExecuteTransaction({ transaction: tx3, signer: keypair });

  console.log('Ethereum signature generated:', signature);
  // This signature is valid for broadcasting on Ethereum
  return signature;
}`,
    },

    // Example 5: Move Contract — DAO Treasury
    move_dao_treasury: {
      description: 'Sui Move contract: DAO treasury with programmable dWallet signing',
      language: 'Move',
      code: `module dao_treasury::treasury {
    use ika_framework::dwallet_coordinator::{
        DWalletCoordinator, DWalletCap, UnverifiedPresignCap, VerifiedPresignCap,
        MessageApproval, SessionIdentifier
    };
    use sui::coin::{Coin};
    use ika_framework::ika::IKA;
    use sui::sui::SUI;

    const ECDSA: u32 = 0;       // ECDSASecp256k1
    const KECCAK256: u8 = 1;    // Hash scheme

    public struct Treasury has key {
        id: UID,
        dwallet_cap: DWalletCap,
        presign_pool: vector<VerifiedPresignCap>,
        votes_needed: u64,
        vote_count: u64,
        pending_message: Option<vector<u8>>,
        ika_balance: Balance<IKA>,
        sui_balance: Balance<SUI>,
    }

    /// Members vote to approve a cross-chain transaction
    public fun vote_to_sign(
        treasury: &mut Treasury,
        message: vector<u8>,
        _ctx: &mut TxContext,
    ) {
        treasury.vote_count = treasury.vote_count + 1;
        if (treasury.vote_count == 1) {
            treasury.pending_message = option::some(message);
        };
    }

    /// Once votes threshold met, execute the signing
    public fun execute_sign(
        treasury: &mut Treasury,
        coordinator: &mut DWalletCoordinator,
        message_centralized_sig: vector<u8>,    // From TypeScript SDK
        session_id: SessionIdentifier,
        payment_ika: &mut Coin<IKA>,
        payment_sui: &mut Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(treasury.vote_count >= treasury.votes_needed, 0);
        let message = option::extract(&mut treasury.pending_message);

        // Approve the specific message via on-chain logic
        let approval: MessageApproval = coordinator.approve_message(
            &treasury.dwallet_cap,
            ECDSA,
            KECCAK256,
            message,
        );

        // Consume one presign from pool
        let presign_cap = vector::pop_back(&mut treasury.presign_pool);

        // Request the signature from Ika network
        coordinator.request_sign(
            presign_cap,
            approval,
            message_centralized_sig,
            session_id,
            payment_ika,
            payment_sui,
            ctx,
        );

        // Reset vote counter
        treasury.vote_count = 0;
    }

    /// Replenish presign pool (call regularly)
    public fun add_presign(treasury: &mut Treasury, presign: VerifiedPresignCap) {
        vector::push_back(&mut treasury.presign_pool, presign);
    }
}`,
    },

    // Example 6: Full end-to-end with Move contract
    e2e_move_interaction: {
      description: 'TypeScript: interact with a Move contract that holds a dWallet',
      language: 'TypeScript',
      code: `import { IkaClient, IkaTransaction, UserShareEncryptionKeys } from '@ika.xyz/sdk';
import { Transaction } from '@mysten/sui.js/transactions';

async function callMoveContractSign(
  ikaClient, suiClient, keypair,
  treasuryObjectId: string,
  coordinatorId: string,
  message: Uint8Array,
) {
  const encryptionKeys = await UserShareEncryptionKeys.fromRootSeed(rootSeed, ikaClient);

  // 1. Get centralized signature component from IKA SDK
  const tx = new IkaTransaction(encryptionKeys);
  const { centralizedSignature, sessionIdentifier } = await tx.prepareSignForMoveContract({
    message,
    coordinatorId,
  });

  // 2. Build the Move transaction calling your DAO contract
  const moveTx = new Transaction();
  moveTx.moveCall({
    target: 'dao_treasury::treasury::execute_sign',
    arguments: [
      moveTx.object(treasuryObjectId),       // treasury: &mut Treasury
      moveTx.object(coordinatorId),           // coordinator: &mut DWalletCoordinator
      moveTx.pure(centralizedSignature),      // message_centralized_sig
      moveTx.object(sessionIdentifier),       // session_id
      moveTx.object('0x...ika_coin'),         // payment_ika
      moveTx.object('0x...sui_coin'),         // payment_sui
    ],
  });

  await suiClient.signAndExecuteTransaction({ transaction: moveTx, signer: keypair });
  console.log('Cross-chain signing initiated via DAO treasury contract');
}`,
    },
  };

  const keys = Object.keys(examples);

  if (example && examples[example]) {
    return { success: true, output: { example, ...examples[example] } };
  }

  return {
    success: true,
    output: {
      available_examples: keys,
      descriptions: Object.fromEntries(
        Object.entries(examples).map(([k, v]: [string, any]) => [k, v.description])
      ),
      usage: 'Call with { "action": "get_code_example", "example": "<name>" } to get the full code',
    },
  };
}

// ─── Operator Guide ───────────────────────────────────────────────────────────

function actionGetOperatorGuide(): SkillExecutionResult {
  return {
    success: true,
    output: {
      overview: 'IKA operators run the network nodes that participate in the 2PC-MPC protocol, enabling decentralized threshold signing.',

      node_types: {
        validator: {
          role: 'Participates in consensus and 2PC-MPC signing protocol',
          requirements: 'Stake IKA tokens, meet hardware requirements, register on mainnet',
          setup: 'See docs.ika.xyz/docs/operators for full NodeConfig YAML reference',
        },
        fullnode: {
          role: 'Provides RPC access, syncs chain state',
          requirements: 'No staking required, hardware requirements lower than validator',
        },
        notifier: {
          role: 'Monitors chain events and notifies relevant parties',
          requirements: 'Lightweight node type',
        },
      },

      node_config_reference: {
        description: 'NodeConfig YAML — configure via config.yaml',
        key_fields: {
          node_type: '"validator" | "fullnode" | "notifier"',
          network_address: 'p2p network address and port',
          key_pair_path: 'Path to Ed25519 key pair file',
          ika_rpc_url: 'IKA network RPC endpoint',
          sui_rpc_url: 'Sui network RPC endpoint (testnet/mainnet)',
          metrics_address: 'Prometheus metrics endpoint (default: 0.0.0.0:9184)',
        },
      },

      validator_registration: {
        steps: [
          '1. Generate validator key pair',
          '2. Fund with IKA tokens for stake',
          '3. Register on-chain via IKA CLI or SDK',
          '4. Configure NodeConfig YAML with network parameters',
          '5. Start the node binary',
          '6. Monitor via Prometheus metrics and health endpoint',
        ],
        cli: 'ika-node --config config.yaml',
      },

      monitoring: {
        prometheus: 'Exposed at metrics_address (default :9184)',
        health_check: 'HTTP health endpoint for liveness probes',
        key_metrics: ['consensus_round', 'mpc_sessions_active', 'signing_latency_ms', 'peer_count'],
      },

      recovery: {
        checkpoint_sync: 'Download snapshot from a trusted fullnode to speed up initial sync',
        key_backup: 'Back up validator key pair — loss means inability to participate in consensus',
        note: 'IKA operators documentation at docs.ika.xyz/docs/operators (full reference coming soon)',
      },

      testnet_info: {
        status: 'Testnet active — mainnet registration available',
        faucet: 'Available for testnet IKA and SUI tokens',
        explorer: 'Monitor network state via block explorer at ika.xyz',
      },
    },
  };
}

// ─── Main executor ────────────────────────────────────────────────────────────

export const IKA_DWALLET_SKILL_METADATA = {
  name: 'IKA dWallet Network',
  description:
    '[ARSENAL-HOSTED ✓] Developer reference for IKA — the Zero-Trust Threshold Signature Network enabling ' +
    'programmable, non-collusive cross-chain signing from Sui smart contracts. Build dWallets that sign ' +
    'Bitcoin, Ethereum, Solana, and Polkadot transactions natively without bridges.\n\n' +
    'Covers: TypeScript SDK (IkaClient, IkaTransaction, UserShareEncryptionKeys), dWallet types ' +
    '(Zero-Trust / Shared / Imported Key), Sui Move contract integration (DKG, presign, signing protocols, ' +
    'DWalletCoordinator API), cryptographic primitives (SECP256K1/R1, ED25519, RISTRETTO curves), ' +
    'complete code examples, and operator/node setup guide.',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  external_url: 'https://ika.xyz',
  partner_verified: true,
  tags: [
    'ika', 'dwallet', 'threshold-signature', 'mpc', '2pc-mpc', 'zero-trust',
    'cross-chain', 'multi-chain', 'bitcoin', 'ethereum', 'sui', 'move',
    'cryptography', 'ecdsa', 'schnorr', 'eddsa', 'taproot', 'key-management',
    'decentralized-custody', 'dao-treasury', 'web3-infrastructure',
  ],
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_protocol_info',
          'get_sdk_reference',
          'get_dwallet_types',
          'get_move_reference',
          'get_crypto_primitives',
          'get_code_example',
          'get_operator_guide',
        ],
        description:
          'Action to perform: ' +
          'get_protocol_info (IKA overview, architecture, use cases), ' +
          'get_sdk_reference (TypeScript SDK: IkaClient, IkaTransaction, UserShareEncryptionKeys), ' +
          'get_dwallet_types (Zero-Trust vs Shared vs Imported Key comparison), ' +
          'get_move_reference (Sui Move integration: DKG/presign/sign protocols, coordinator API), ' +
          'get_crypto_primitives (supported curves, signature algorithms, hash schemes), ' +
          'get_code_example (complete code examples for common flows), ' +
          'get_operator_guide (node setup, validator registration, monitoring).',
      },
      example: {
        type: 'string',
        enum: [
          'zero_trust_dwallet',
          'shared_dwallet',
          'import_key',
          'presign_and_sign',
          'move_dao_treasury',
          'e2e_move_interaction',
        ],
        description:
          'For get_code_example action: which example to return. ' +
          'zero_trust_dwallet (create + sign with Zero-Trust dWallet), ' +
          'shared_dwallet (create Shared dWallet for DAO/contract use), ' +
          'import_key (import existing BTC/ETH private key), ' +
          'presign_and_sign (full presign + sign flow for Ethereum tx), ' +
          'move_dao_treasury (Sui Move DAO treasury contract with dWallet), ' +
          'e2e_move_interaction (TypeScript calling a Move contract that signs).',
      },
    },
  },
  usage_examples: [
    {
      description: 'Get IKA protocol overview and use cases',
      input: { action: 'get_protocol_info' },
    },
    {
      description: 'Get TypeScript SDK reference for building with IKA',
      input: { action: 'get_sdk_reference' },
    },
    {
      description: 'Compare dWallet types: Zero-Trust vs Shared vs Imported Key',
      input: { action: 'get_dwallet_types' },
    },
    {
      description: 'Get Sui Move integration guide with DKG/presign/sign protocols',
      input: { action: 'get_move_reference' },
    },
    {
      description: 'Get supported cryptographic primitives for target chains (BTC, ETH, SOL, DOT)',
      input: { action: 'get_crypto_primitives' },
    },
    {
      description: 'List all available code examples',
      input: { action: 'get_code_example' },
    },
    {
      description: 'Get Zero-Trust dWallet creation + signing code example',
      input: { action: 'get_code_example', example: 'zero_trust_dwallet' },
    },
    {
      description: 'Get Sui Move DAO treasury contract with dWallet signing',
      input: { action: 'get_code_example', example: 'move_dao_treasury' },
    },
    {
      description: 'Get full presign + Ethereum transaction signing example',
      input: { action: 'get_code_example', example: 'presign_and_sign' },
    },
    {
      description: 'Get IKA node operator setup guide',
      input: { action: 'get_operator_guide' },
    },
  ],
};

export async function executeIkaDwalletSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  try {
    switch (action) {
      case 'get_protocol_info':    return actionGetProtocolInfo();
      case 'get_sdk_reference':    return actionGetSdkReference();
      case 'get_dwallet_types':    return actionGetDwalletTypes();
      case 'get_move_reference':   return actionGetMoveReference();
      case 'get_crypto_primitives':return actionGetCryptoPrimitives();
      case 'get_code_example':     return actionGetCodeExample(input);
      case 'get_operator_guide':   return actionGetOperatorGuide();
      default:
        return {
          success: false,
          error: `Unknown action "${action}". Available: get_protocol_info, get_sdk_reference, get_dwallet_types, get_move_reference, get_crypto_primitives, get_code_example, get_operator_guide`,
        };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unexpected error in IKA dWallet skill' };
  }
}
