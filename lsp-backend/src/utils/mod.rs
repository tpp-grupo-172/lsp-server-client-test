use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use crate::Connections;

const RENAME_CONFIDENCE_THRESHOLD: f32 = 0.65;

#[derive(Debug)]
pub enum FunctionChange {
    Added(String),
    Removed(String),
    Renamed {
        old_name: String,
        new_name: String,
        confidence: f32,
    },
    Modified {
        name: String,
        changes: Vec<SignatureChange>,
    },
}

#[derive(Debug)]
pub enum SignatureChange {
    ReturnTypeChanged { old: String, new: String },
    ParameterAdded(String),
    ParameterRemoved(String),
}

fn extract_functions(file_value: &Value) -> Vec<&Value> {
    file_value
        .get("functions")
        .and_then(|f| f.as_array())
        .map(|arr| arr.iter().collect())
        .unwrap_or_default()
}

fn get_name(func: &Value) -> Option<&str> {
    func.get("name")?.as_str()
}

fn get_params(func: &Value) -> Vec<String> {
    func.get("parameters")
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    // Soporta tanto string plano como objeto { "name": "...", ... }
                    p.as_str()
                        .map(|s| s.to_string())
                        .or_else(|| p.get("name")?.as_str().map(|s| s.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn get_return_type(func: &Value) -> Option<String> {
    func.get("return_type")
        .filter(|v| !v.is_null())
        .and_then(|v| {
            v.as_str()
                .map(|s| s.to_string())
                .or_else(|| Some(v.to_string()))
        })
}

fn param_similarity(old: &[String], new: &[String]) -> f32 {
    if old.is_empty() && new.is_empty() {
        return 1.0;
    }
    if old.is_empty() || new.is_empty() {
        return 0.0;
    }

    let shared = old.iter().filter(|p| new.contains(p)).count();
    let union = old.len().max(new.len());

    shared as f32 / union as f32
}

fn name_similarity(a: &str, b: &str) -> f32 {
    if a == b {
        return 1.0;
    }

    let tokens_a: Vec<&str> = a.split('_').collect();
    let tokens_b: Vec<&str> = b.split('_').collect();

    let shared = tokens_a.iter().filter(|t| tokens_b.contains(t)).count();
    let union = tokens_a.len().max(tokens_b.len());

    if union == 0 {
        return 0.0;
    }
    shared as f32 / union as f32
}

fn similarity_score(old_func: &Value, new_func: &Value) -> f32 {
    let old_params = get_params(old_func);
    let new_params = get_params(new_func);
    let param_sim = param_similarity(&old_params, &new_params);

    let return_sim = match (get_return_type(old_func), get_return_type(new_func)) {
        (Some(a), Some(b)) => {
            if a == b {
                1.0
            } else {
                0.0
            }
        }
        (None, None) => 1.0,
        _ => 0.3,
    };

    let old_name = get_name(old_func).unwrap_or("");
    let new_name = get_name(new_func).unwrap_or("");
    let name_sim = name_similarity(old_name, new_name);

    0.5 * param_sim + 0.3 * return_sim + 0.2 * name_sim
}

fn detect_signature_changes(old_func: &Value, new_func: &Value) -> Vec<SignatureChange> {
    let mut changes = Vec::new();

    let old_ret = get_return_type(old_func);
    let new_ret = get_return_type(new_func);
    if old_ret != new_ret {
        changes.push(SignatureChange::ReturnTypeChanged {
            old: old_ret.unwrap_or_else(|| "None".to_string()),
            new: new_ret.unwrap_or_else(|| "None".to_string()),
        });
    }

    let old_params = get_params(old_func);
    let new_params = get_params(new_func);

    for p in &old_params {
        if !new_params.contains(p) {
            changes.push(SignatureChange::ParameterRemoved(p.clone()));
        }
    }
    for p in &new_params {
        if !old_params.contains(p) {
            changes.push(SignatureChange::ParameterAdded(p.clone()));
        }
    }

    changes
}

pub fn detect_function_changes(
    file_path: &PathBuf,
    current_value: &Value,
    old_versions: &HashMap<PathBuf, Value>,
) -> Vec<FunctionChange> {
    let mut changes = Vec::new();

    let old_file = match old_versions.get(file_path) {
        Some(v) => v,
        None => {
            let added: Vec<FunctionChange> = extract_functions(current_value)
                .iter()
                .filter_map(|f| get_name(f).map(|n| FunctionChange::Added(n.to_string())))
                .collect();
            return added;
        }
    };

    let old_funcs = extract_functions(old_file);
    let new_funcs = extract_functions(current_value);

    let old_by_name: HashMap<&str, &Value> = old_funcs
        .iter()
        .filter_map(|f| get_name(f).map(|n| (n, *f)))
        .collect();
    let new_by_name: HashMap<&str, &Value> = new_funcs
        .iter()
        .filter_map(|f| get_name(f).map(|n| (n, *f)))
        .collect();

    let mut matched_old: Vec<&str> = Vec::new();
    let mut matched_new: Vec<&str> = Vec::new();

    for (name, old_func) in &old_by_name {
        if let Some(new_func) = new_by_name.get(name) {
            let sig_changes = detect_signature_changes(old_func, new_func);
            if !sig_changes.is_empty() {
                changes.push(FunctionChange::Modified {
                    name: name.to_string(),
                    changes: sig_changes,
                });
            }
            matched_old.push(name);
            matched_new.push(name);
        }
    }

    let orphan_old: Vec<(&str, &Value)> = old_by_name
        .iter()
        .filter(|(name, _)| !matched_old.contains(name))
        .map(|(n, v)| (*n, *v))
        .collect();

    let orphan_new: Vec<(&str, &Value)> = new_by_name
        .iter()
        .filter(|(name, _)| !matched_new.contains(name))
        .map(|(n, v)| (*n, *v))
        .collect();

    let mut scored_pairs: Vec<(f32, &str, &str)> = Vec::new();

    for (old_name, old_func) in &orphan_old {
        for (new_name, new_func) in &orphan_new {
            let score = similarity_score(old_func, new_func);
            if score >= RENAME_CONFIDENCE_THRESHOLD {
                scored_pairs.push((score, old_name, new_name));
            }
        }
    }

    scored_pairs.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());

    let mut consumed_old: Vec<&str> = Vec::new();
    let mut consumed_new: Vec<&str> = Vec::new();

    for (score, old_name, new_name) in scored_pairs {
        if consumed_old.contains(&old_name) || consumed_new.contains(&new_name) {
            continue;
        }
        changes.push(FunctionChange::Renamed {
            old_name: old_name.to_string(),
            new_name: new_name.to_string(),
            confidence: score,
        });
        consumed_old.push(old_name);
        consumed_new.push(new_name);
    }

    for (old_name, _) in &orphan_old {
        if !consumed_old.contains(old_name) {
            changes.push(FunctionChange::Removed(old_name.to_string()));
        }
    }
    for (new_name, _) in &orphan_new {
        if !consumed_new.contains(new_name) {
            changes.push(FunctionChange::Added(new_name.to_string()));
        }
    }

    changes
}

/// Para cada función modificada/renombrada, devuelve los archivos que la usan
pub fn affected_files_by_change(
    changes: &[FunctionChange],
    connections: &[Connections],
    file_src: &PathBuf,
) -> HashMap<String, Vec<String>> {
    let path_str = file_src.to_str().unwrap().to_string();
    let changed_functions: Vec<&str> = changes
        .iter()
        .filter_map(|change| match change {
            FunctionChange::Modified { name, .. } => Some(name.as_str()),
            FunctionChange::Renamed { old_name, .. } => Some(old_name.as_str()),
            FunctionChange::Removed(name) => Some(name.as_str()),
            FunctionChange::Added(_) => None,
        })
        .collect();

    let mut result: HashMap<String, Vec<String>> = HashMap::new();

    for conn in connections
        .iter()
        .filter(|c| c.file_src == path_str && changed_functions.contains(&c.function.as_str()))
    {
        result
            .entry(conn.function.clone())
            .or_default()
            .push(conn.file_use.clone());
    }

    result
}