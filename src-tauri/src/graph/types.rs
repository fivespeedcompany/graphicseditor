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
    Levels { input_black: f32, input_white: f32, gamma: f32 },
    Curves { shadows: f32, midtones: f32, highlights: f32 },
    GradientMap { hue_a: f32, hue_b: f32, saturation: f32 },
    Transform { rotate: f32, scale: f32 },
    MixBlend { opacity: f32, mode: f32 },
    Mask { invert: f32 },
    Pixelate { size: f32 },
    Dither { levels: f32, strength: f32 },
    NoiseTexture { freq: f32, octaves: f32, intensity: f32 },
    Displace { amount: f32, freq: f32 },
    ImageNode,
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
