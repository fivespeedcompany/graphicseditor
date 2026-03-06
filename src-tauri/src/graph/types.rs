use serde::{Deserialize, Serialize};

pub type NodeId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub from_node: NodeId,
    pub from_port: String,
    pub to_node: NodeId,
    pub to_port: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum NodeKind {
    ImageInput,
    BrightnessContrast { brightness: f32, contrast: f32 },
    Blur { radius: f32 },
    Saturation { amount: f32 },
    HueShift { degrees: f32 },
    Invert { amount: f32 },
    Grayscale { amount: f32 },
    Sharpen { amount: f32 },
    Noise { amount: f32 },
    Vignette { amount: f32, softness: f32 },
    Output,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: NodeId,
    pub kind: NodeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecuteGraphPayload {
    pub graph: Graph,
    pub preview: bool,
}

#[derive(Debug, Serialize)]
pub struct ExecutionResult {
    pub image_b64: String,
    pub width: u32,
    pub height: u32,
}
