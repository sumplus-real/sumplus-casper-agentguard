/**
 * Casper AgentGuard
 *
 * Agent policy and receipt registry toolkit for Casper Testnet.
 *
 * This skill intentionally does not move funds. It gives Sumplus agents a
 * Casper-native audit rail: register a policy hash, record an agent proposal,
 * record a decision, record an execution receipt, then verify the deploy trail.
 *
 * Skill UUID: 88c60a3a-6608-4449-9e47-3b8d99120917
 */

import type { SkillExecutionResult } from '@/types/skill';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

const DEFAULT_NODE = 'https://node.testnet.casper.network/rpc';
const CHAIN_NAME = 'casper-test';
const EXPLORER = 'https://testnet.cspr.live';
const DEFAULT_INSTALL_PAYMENT_MOTES = '150000000000';
const DEFAULT_CALL_PAYMENT_MOTES = '20000000000';

type Json = Record<string, any>;

function nodeUrl(input?: unknown): string {
  return String(input || process.env.CASPER_TESTNET_NODE_URL || DEFAULT_NODE).replace(/\/$/, '');
}

function sha256Hex(value: unknown): string {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return crypto.createHash('sha256').update(text).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function clampPrintable(value: unknown, max = 1024): string {
  return String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, max);
}

function jsonRpc(method: string, params: any[] = [], url = nodeUrl()): Promise<any> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const proxyUrl = process.env.https_proxy || process.env.http_proxy;

    let client: typeof http | typeof https;
    let options: any;

    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      client = http;
      options = {
        hostname: proxy.hostname,
        port: proxy.port || 7890,
        path: url,
        method: 'POST',
        headers: {
          Host: targetUrl.hostname,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15000,
      };
    } else {
      client = targetUrl.protocol === 'http:' ? http : https;
      options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'http:' ? 80 : 443),
        path: targetUrl.pathname + targetUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15000,
        family: 4,
      };
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Casper RPC ${method} error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`));
            return;
          }
          resolve(parsed.result?.value ?? parsed.result);
        } catch {
          reject(new Error(`Casper RPC parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Casper RPC ${method} timeout`)); });
    req.write(payload);
    req.end();
  });
}

function namedParam(name: string, value: unknown): Json {
  return { name, value };
}

function deployUrl(hash: string): string {
  return `${EXPLORER}/deploy/${hash}`;
}

function normalizePackageHash(hash: string): string {
  return hash
    .replace(/^contract-package-/, '')
    .replace(/^package-/, '')
    .replace(/^hash-/, '');
}

function buildRuntimeArgs(args: Record<string, { type: string; value: string }>): string {
  return Object.entries(args)
    .map(([name, spec]) => `  --session-arg "${name}:${spec.type}='${spec.value}'"`)
    .join(' \\\n');
}

function contractCallCommand(params: {
  node: string;
  secretKeyPath: string;
  packageHash: string;
  entryPoint: string;
  paymentAmount?: string;
  args: Record<string, { type: string; value: string }>;
}): string {
  const runtimeArgs = buildRuntimeArgs(params.args);
  return [
    'casper-client put-deploy \\',
    `  --node-address ${params.node} \\`,
    `  --chain-name ${CHAIN_NAME} \\`,
    `  --secret-key ${params.secretKeyPath} \\`,
    `  --payment-amount ${params.paymentAmount || DEFAULT_CALL_PAYMENT_MOTES} \\`,
    `  --session-package-hash ${params.packageHash} \\`,
    `  --session-entry-point "${params.entryPoint}" \\`,
    runtimeArgs,
  ].join('\n');
}

function receiptPayload(input: Json): Json {
  const action = clampPrintable(input.action_name || input.action || 'agent_action');
  const agentId = clampPrintable(input.agent_id || 'sumplus-agent');
  const policyHash = clampPrintable(input.policy_hash || sha256Hex(input.policy || {}));
  const proposalHash = clampPrintable(input.proposal_hash || sha256Hex(input.proposal || input.intent || {}));
  const decisionHash = clampPrintable(input.decision_hash || sha256Hex(input.decision || {}));
  const receiptHash = clampPrintable(input.receipt_hash || sha256Hex(input.receipt || input.result || {}));
  const metadataHash = clampPrintable(input.metadata_hash || sha256Hex({
    agent_id: agentId,
    action_name: action,
    policy_hash: policyHash,
    proposal_hash: proposalHash,
    decision_hash: decisionHash,
    receipt_hash: receiptHash,
    external_ref: input.external_ref || null,
  }));

  return {
    agent_id: agentId,
    action_name: action,
    policy_hash: policyHash,
    proposal_hash: proposalHash,
    decision_hash: decisionHash,
    receipt_hash: receiptHash,
    metadata_hash: metadataHash,
    external_ref: clampPrintable(input.external_ref || '', 512),
    created_at: new Date().toISOString(),
  };
}

export const CASPER_AGENTGUARD_SKILL_METADATA = {
  id: '88c60a3a-6608-4449-9e47-3b8d99120917',
  name: 'Casper AgentGuard',
  description:
    '[ARSENAL-HOSTED] Casper Testnet toolkit for agent policy and receipt anchoring. ' +
    'Agents can inspect Casper Testnet, generate deterministic policy/proposal/decision/receipt hashes, ' +
    'prepare casper-client commands for the AgentGuard registry contract, and verify deploy hashes. ' +
    'Designed for Sumplus Maria/Arsenal/SafeRouter audit trails: AI decides, policy gates, Casper records.',
  category: 'Blockchain',
  version: '0.1.0',
  author_type: 'official' as const,
  is_paid: false,
  price: null,
  tags: ['casper', 'casper-blockchain', 'casper-network', 'buildathon', 'agentic', 'policy', 'audit', 'receipt', 'testnet'],
  external_url: 'https://testnet.cspr.live',
  partner_verified: false,
  status: 'approved' as const,
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: [
          'get_chain_info',
          'get_node_status',
          'get_latest_block',
          'get_state_root_hash',
          'get_deploy_status',
          'build_agent_receipt',
          'build_install_command',
          'build_registry_call',
          'get_demo_playbook',
        ],
        description:
          'get_chain_info: static Casper Testnet config and official deployment workflow. ' +
          'get_node_status/get_latest_block/get_state_root_hash/get_deploy_status: read Casper Testnet JSON-RPC. ' +
          'build_agent_receipt: hash an agent policy/proposal/decision/receipt into deterministic fields. ' +
          'build_install_command: generate the casper-client command to install the AgentGuard registry Wasm. ' +
          'build_registry_call: generate casper-client commands for register_policy, submit_proposal, record_decision, or record_receipt entry points. ' +
          'get_demo_playbook: concise hackathon testing steps.',
      },
      node_address: { type: 'string', description: `Casper node JSON-RPC URL. Defaults to CASPER_TESTNET_NODE_URL or ${DEFAULT_NODE}.` },
      deploy_hash: { type: 'string', description: 'Casper deploy or transaction hash to verify.' },
      secret_key_path: { type: 'string', description: 'Local path to Casper account secret_key.pem for generated casper-client commands.' },
      session_path: { type: 'string', description: 'Path to compiled AgentGuard registry Wasm for installation.' },
      package_hash: { type: 'string', description: 'Casper contract package hash. The skill accepts contract-package-..., package-..., hash-..., or raw hex, and emits raw hex for casper-client.' },
      entry_point: { type: 'string', enum: ['register_policy', 'submit_proposal', 'record_decision', 'record_receipt'], description: 'AgentGuard registry entry point for build_registry_call.' },
      agent_id: { type: 'string', description: 'Stable Sumplus/Maria/Arsenal agent identifier.' },
      action_name: { type: 'string', description: 'Human-readable action class, e.g. swap.quote, payout.review, safe_router.chat.' },
      policy: { type: 'object', description: 'Policy JSON. The skill hashes this into policy_hash if policy_hash is omitted.' },
      proposal: { type: 'object', description: 'Proposal/intent JSON. The skill hashes this into proposal_hash if proposal_hash is omitted.' },
      decision: { type: 'object', description: 'Policy decision JSON. The skill hashes this into decision_hash if decision_hash is omitted.' },
      receipt: { type: 'object', description: 'Execution receipt JSON. The skill hashes this into receipt_hash if receipt_hash is omitted.' },
      policy_hash: { type: 'string', description: 'Existing policy hash to anchor.' },
      proposal_hash: { type: 'string', description: 'Existing proposal hash to anchor.' },
      decision_hash: { type: 'string', description: 'Existing decision hash to anchor.' },
      receipt_hash: { type: 'string', description: 'Existing receipt hash to anchor.' },
      external_ref: { type: 'string', description: 'Off-chain reference: DoraHacks BUIDL ID, Sumplus turn ID, transaction hash, or IPFS/HTTPS URL.' },
      payment_amount: { type: 'string', description: `Payment amount in motes. Defaults to ${DEFAULT_CALL_PAYMENT_MOTES} for calls and ${DEFAULT_INSTALL_PAYMENT_MOTES} for install.` },
    },
  },
  usage_examples: [
    { title: 'Casper Testnet info', input: { action: 'get_chain_info' } },
    { title: 'Build receipt hashes', input: { action: 'build_agent_receipt', agent_id: 'maria-demo', action_name: 'policy.checked', policy: { allowed_actions: ['record_receipt'] }, decision: { allow: true } } },
    { title: 'Verify deploy', input: { action: 'get_deploy_status', deploy_hash: '5c9b3b099c1378aa8e4a5f07f59ff1fcdc69a83179427c7e67ae0377d94d93fa' } },
  ],
};

export async function executeCasperAgentGuardSkill(input: Json): Promise<SkillExecutionResult> {
  const action = input?.action as string;
  const node = nodeUrl(input?.node_address);

  try {
    switch (action) {
      case 'get_chain_info':
        return {
          success: true,
          output: {
            network: 'Casper Testnet',
            chain_name: CHAIN_NAME,
            node_address: node,
            explorer: EXPLORER,
            faucet: 'https://testnet.cspr.live/tools/faucet',
            docs: {
              developers: 'https://docs.casper.network/developers',
              quickstart: 'https://docs.casper.network/resources/quick-start',
              json_rpc: 'https://docs.casper.network/developers/json-rpc/json-rpc-informational',
            },
            local_tools: ['rustup', 'cmake', 'cargo-casper', 'casper-client'],
            install_notes: [
              'cargo install cargo-casper',
              'cargo install casper-client',
              'rustup component add rust-src',
              'casper-client put-deploy --chain-name casper-test --session-path <registry.wasm>',
            ],
            skill_id: CASPER_AGENTGUARD_SKILL_METADATA.id,
            purpose: 'Policy-gated agent action receipts on Casper Testnet.',
          },
        };

      case 'get_node_status': {
        const status = await jsonRpc('info_get_status', [], node);
        return { success: true, output: { node_address: node, status } };
      }

      case 'get_latest_block': {
        const block = await jsonRpc('chain_get_block', [], node);
        return { success: true, output: { node_address: node, block } };
      }

      case 'get_state_root_hash': {
        const state_root_hash = await jsonRpc('chain_get_state_root_hash', [], node);
        return { success: true, output: { node_address: node, state_root_hash } };
      }

      case 'get_deploy_status': {
        if (!input.deploy_hash) return { success: false, error: 'deploy_hash is required' };
        const deploy = await jsonRpc('info_get_deploy', [
          namedParam('deploy_hash', input.deploy_hash),
          namedParam('finalized_approvals', true),
        ], node);
        return {
          success: true,
          output: {
            node_address: node,
            deploy_hash: input.deploy_hash,
            explorer_url: deployUrl(String(input.deploy_hash)),
            deploy,
          },
        };
      }

      case 'build_agent_receipt': {
        return { success: true, output: receiptPayload(input) };
      }

      case 'build_install_command': {
        const secretKeyPath = input.secret_key_path || '[PATH_TO_SECRET_KEY]';
        const sessionPath = input.session_path || 'contracts/casper-agentguard/contract/target/wasm32-unknown-unknown/release/casper_agentguard.wasm';
        return {
          success: true,
          output: {
            command: [
              'casper-client put-deploy \\',
              `  --node-address ${node} \\`,
              `  --chain-name ${CHAIN_NAME} \\`,
              `  --secret-key ${secretKeyPath} \\`,
              `  --payment-amount ${input.payment_amount || DEFAULT_INSTALL_PAYMENT_MOTES} \\`,
              `  --session-path ${sessionPath}`,
            ].join('\n'),
            next_steps: [
              'Record the deploy hash returned by casper-client.',
              'Run get_deploy_status until execution_info is present.',
              'Read the installed contract package hash from the named keys on the installing account.',
              'Add package hash and sample deploy hashes to the BUIDL page.',
            ],
          },
        };
      }

      case 'build_registry_call': {
        if (!input.package_hash) return { success: false, error: 'package_hash is required' };
        if (!input.entry_point) return { success: false, error: 'entry_point is required' };
        const secretKeyPath = String(input.secret_key_path || '[PATH_TO_SECRET_KEY]');
        const payload = receiptPayload(input);
        const argsByEntry: Record<string, Record<string, { type: string; value: string }>> = {
          register_policy: {
            agent_id: { type: 'string', value: payload.agent_id },
            policy_hash: { type: 'string', value: payload.policy_hash },
            metadata_hash: { type: 'string', value: payload.metadata_hash },
            external_ref: { type: 'string', value: payload.external_ref },
          },
          submit_proposal: {
            agent_id: { type: 'string', value: payload.agent_id },
            action_name: { type: 'string', value: payload.action_name },
            policy_hash: { type: 'string', value: payload.policy_hash },
            proposal_hash: { type: 'string', value: payload.proposal_hash },
            external_ref: { type: 'string', value: payload.external_ref },
          },
          record_decision: {
            agent_id: { type: 'string', value: payload.agent_id },
            proposal_hash: { type: 'string', value: payload.proposal_hash },
            decision_hash: { type: 'string', value: payload.decision_hash },
            external_ref: { type: 'string', value: payload.external_ref },
          },
          record_receipt: {
            agent_id: { type: 'string', value: payload.agent_id },
            proposal_hash: { type: 'string', value: payload.proposal_hash },
            decision_hash: { type: 'string', value: payload.decision_hash },
            receipt_hash: { type: 'string', value: payload.receipt_hash },
            external_ref: { type: 'string', value: payload.external_ref },
          },
        };
        const entryPoint = String(input.entry_point);
        const args = argsByEntry[entryPoint];
        if (!args) return { success: false, error: `Unsupported entry_point: ${entryPoint}` };
        return {
          success: true,
          output: {
            entry_point: entryPoint,
            payload,
            command: contractCallCommand({
              node,
              secretKeyPath,
              packageHash: normalizePackageHash(String(input.package_hash)),
              entryPoint,
              paymentAmount: input.payment_amount,
              args,
            }),
          },
        };
      }

      case 'get_demo_playbook':
        return {
          success: true,
          output: {
            title: 'Casper AgentGuard DoraHacks testing playbook',
            steps: [
              'Open Arsenal and execute Casper AgentGuard get_chain_info.',
              'Run build_agent_receipt with a Maria demo policy/proposal/decision/receipt JSON.',
              'Install the AgentGuard registry Wasm on Casper Testnet with build_install_command.',
              'Record the returned package hash.',
              'Run build_registry_call for register_policy, submit_proposal, record_decision, and record_receipt.',
              'Submit each casper-client deploy, then verify with get_deploy_status.',
              'Paste the contract package hash and deploy hashes into the BUIDL page.',
            ],
            demo_story:
              'Maria proposes an automated grant-payout review. Arsenal hashes the policy and decision. Casper records the policy/proposal/decision/receipt trail so any reviewer can verify what the agent was allowed to do and what it actually did.',
          },
        };

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Casper AgentGuard skill error' };
  }
}
