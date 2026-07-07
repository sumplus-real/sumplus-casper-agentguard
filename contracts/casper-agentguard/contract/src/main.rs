#![no_std]
#![no_main]

extern crate alloc;

use alloc::{
    format,
    string::{String, ToString},
    vec,
    vec::Vec,
};

use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    addressable_entity::{
        EntityEntryPoint, EntryPointAccess, EntryPointPayment, EntryPointType, EntryPoints,
    },
    api_error::ApiError,
    contracts::NamedKeys,
    CLType, Parameter, URef,
};

const CONTRACT_HASH_KEY: &str = "agentguard_contract_hash";
const CONTRACT_VERSION_KEY: &str = "agentguard_contract_version";
const CONTRACT_PACKAGE_NAME: &str = "agentguard_package";
const CONTRACT_ACCESS_UREF: &str = "agentguard_access_uref";

const POLICIES_DICT: &str = "policies";
const PROPOSALS_DICT: &str = "proposals";
const DECISIONS_DICT: &str = "decisions";
const RECEIPTS_DICT: &str = "receipts";

const REGISTER_POLICY: &str = "register_policy";
const SUBMIT_PROPOSAL: &str = "submit_proposal";
const RECORD_DECISION: &str = "record_decision";
const RECORD_RECEIPT: &str = "record_receipt";

#[repr(u16)]
enum AgentGuardError {
    MissingDictionary = 1,
}

impl From<AgentGuardError> for ApiError {
    fn from(error: AgentGuardError) -> Self {
        ApiError::User(error as u16)
    }
}

fn arg(name: &str) -> String {
    runtime::get_named_arg::<String>(name)
}

fn dictionary_seed(name: &str) -> URef {
    *runtime::get_key(name)
        .unwrap_or_revert_with(AgentGuardError::MissingDictionary)
        .as_uref()
        .unwrap_or_revert_with(AgentGuardError::MissingDictionary)
}

fn put_record(dictionary_name: &str, key: &str, value: String) {
    storage::dictionary_put(dictionary_seed(dictionary_name), key, value);
}

#[no_mangle]
pub extern "C" fn register_policy() {
    let agent_id = arg("agent_id");
    let policy_hash = arg("policy_hash");
    let metadata_hash = arg("metadata_hash");
    let external_ref = arg("external_ref");

    put_record(
        POLICIES_DICT,
        &policy_hash,
        format!(
            "agent_id={};policy_hash={};metadata_hash={};external_ref={}",
            agent_id, policy_hash, metadata_hash, external_ref
        ),
    );
}

#[no_mangle]
pub extern "C" fn submit_proposal() {
    let agent_id = arg("agent_id");
    let action_name = arg("action_name");
    let policy_hash = arg("policy_hash");
    let proposal_hash = arg("proposal_hash");
    let external_ref = arg("external_ref");

    put_record(
        PROPOSALS_DICT,
        &proposal_hash,
        format!(
            "agent_id={};action_name={};policy_hash={};proposal_hash={};external_ref={}",
            agent_id, action_name, policy_hash, proposal_hash, external_ref
        ),
    );
}

#[no_mangle]
pub extern "C" fn record_decision() {
    let agent_id = arg("agent_id");
    let proposal_hash = arg("proposal_hash");
    let decision_hash = arg("decision_hash");
    let external_ref = arg("external_ref");

    put_record(
        DECISIONS_DICT,
        &proposal_hash,
        format!(
            "agent_id={};proposal_hash={};decision_hash={};external_ref={}",
            agent_id, proposal_hash, decision_hash, external_ref
        ),
    );
}

#[no_mangle]
pub extern "C" fn record_receipt() {
    let agent_id = arg("agent_id");
    let proposal_hash = arg("proposal_hash");
    let decision_hash = arg("decision_hash");
    let receipt_hash = arg("receipt_hash");
    let external_ref = arg("external_ref");

    put_record(
        RECEIPTS_DICT,
        &proposal_hash,
        format!(
            "agent_id={};proposal_hash={};decision_hash={};receipt_hash={};external_ref={}",
            agent_id, proposal_hash, decision_hash, receipt_hash, external_ref
        ),
    );
}

fn string_arg(name: &str) -> Parameter {
    Parameter::new(name, CLType::String)
}

fn entry_point(name: &str, args: Vec<Parameter>) -> EntityEntryPoint {
    EntityEntryPoint::new(
        name,
        args,
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    )
}

fn agentguard_entry_points() -> EntryPoints {
    let mut entry_points = EntryPoints::new();
    entry_points.add_entry_point(entry_point(
        REGISTER_POLICY,
        vec![
            string_arg("agent_id"),
            string_arg("policy_hash"),
            string_arg("metadata_hash"),
            string_arg("external_ref"),
        ],
    ));
    entry_points.add_entry_point(entry_point(
        SUBMIT_PROPOSAL,
        vec![
            string_arg("agent_id"),
            string_arg("action_name"),
            string_arg("policy_hash"),
            string_arg("proposal_hash"),
            string_arg("external_ref"),
        ],
    ));
    entry_points.add_entry_point(entry_point(
        RECORD_DECISION,
        vec![
            string_arg("agent_id"),
            string_arg("proposal_hash"),
            string_arg("decision_hash"),
            string_arg("external_ref"),
        ],
    ));
    entry_points.add_entry_point(entry_point(
        RECORD_RECEIPT,
        vec![
            string_arg("agent_id"),
            string_arg("proposal_hash"),
            string_arg("decision_hash"),
            string_arg("receipt_hash"),
            string_arg("external_ref"),
        ],
    ));
    entry_points
}

#[no_mangle]
pub extern "C" fn call() {
    let mut named_keys = NamedKeys::new();
    named_keys.insert(
        POLICIES_DICT.to_string(),
        storage::new_dictionary(POLICIES_DICT).unwrap_or_revert().into(),
    );
    named_keys.insert(
        PROPOSALS_DICT.to_string(),
        storage::new_dictionary(PROPOSALS_DICT).unwrap_or_revert().into(),
    );
    named_keys.insert(
        DECISIONS_DICT.to_string(),
        storage::new_dictionary(DECISIONS_DICT).unwrap_or_revert().into(),
    );
    named_keys.insert(
        RECEIPTS_DICT.to_string(),
        storage::new_dictionary(RECEIPTS_DICT).unwrap_or_revert().into(),
    );

    let (contract_hash, contract_version) = storage::new_contract(
        agentguard_entry_points(),
        Some(named_keys),
        Some(CONTRACT_PACKAGE_NAME.to_string()),
        Some(CONTRACT_ACCESS_UREF.to_string()),
        None,
    );

    runtime::put_key(CONTRACT_HASH_KEY, contract_hash.into());
    runtime::put_key(
        CONTRACT_VERSION_KEY,
        storage::new_uref(contract_version).into(),
    );
}
