use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use image::DynamicImage;

use crate::graph::types::*;
use crate::nodes::NodeExecutor;
use crate::nodes::{color, effect, filter};

pub fn topo_sort(graph: &Graph) -> Result<Vec<NodeId>, String> {
    let mut in_degree: HashMap<NodeId, usize> = HashMap::new();
    let mut adj: HashMap<NodeId, Vec<NodeId>> = HashMap::new();

    for node in &graph.nodes {
        in_degree.entry(node.id.clone()).or_insert(0);
        adj.entry(node.id.clone()).or_default();
    }
    for edge in &graph.edges {
        *in_degree.entry(edge.to_node.clone()).or_insert(0) += 1;
        adj.entry(edge.from_node.clone()).or_default().push(edge.to_node.clone());
    }

    let mut queue: VecDeque<NodeId> = in_degree
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(id, _)| id.clone())
        .collect();
    let mut sorted = Vec::new();

    while let Some(id) = queue.pop_front() {
        sorted.push(id.clone());
        if let Some(neighbors) = adj.get(&id) {
            for n in neighbors {
                let deg = in_degree.get_mut(n).unwrap();
                *deg -= 1;
                if *deg == 0 {
                    queue.push_back(n.clone());
                }
            }
        }
    }

    if sorted.len() != graph.nodes.len() {
        return Err("Graph contains a cycle".into());
    }
    Ok(sorted)
}

pub fn execute(
    graph: &Graph,
    source_image: Arc<DynamicImage>,
    preview: bool,
) -> Result<Arc<DynamicImage>, String> {
    let source = if preview {
        let (w, h) = (source_image.width(), source_image.height());
        let max = 512u32;
        if w > max || h > max {
            let scale = max as f32 / w.max(h) as f32;
            Arc::new(source_image.resize(
                (w as f32 * scale) as u32,
                (h as f32 * scale) as u32,
                image::imageops::FilterType::Nearest,
            ))
        } else {
            source_image
        }
    } else {
        source_image
    };

    let order = topo_sort(graph)?;
    let mut ctx: HashMap<NodeId, Arc<DynamicImage>> = HashMap::new();

    let mut inputs_map: HashMap<NodeId, Vec<NodeId>> = HashMap::new();
    for edge in &graph.edges {
        inputs_map
            .entry(edge.to_node.clone())
            .or_default()
            .push(edge.from_node.clone());
    }

    let node_map: HashMap<NodeId, &GraphNode> =
        graph.nodes.iter().map(|n| (n.id.clone(), n)).collect();

    for id in &order {
        let node = node_map[id];
        let inputs: Vec<Arc<DynamicImage>> = inputs_map
            .get(id)
            .map(|srcs| srcs.iter().filter_map(|s| ctx.get(s).cloned()).collect())
            .unwrap_or_default();

        let result: Arc<DynamicImage> = match &node.kind {
            NodeKind::ImageInput => source.clone(),
            NodeKind::Output => {
                inputs.into_iter().next().ok_or("Output node has no input")?
            }
            kind => {
                let executor = make_executor(kind)?;
                executor.execute(inputs)?
            }
        };
        ctx.insert(id.clone(), result);
    }

    let output_node = graph
        .nodes
        .iter()
        .find(|n| matches!(n.kind, NodeKind::Output))
        .ok_or("No Output node in graph")?;
    ctx.remove(&output_node.id)
        .ok_or("Output node produced no image".into())
}

fn make_executor(kind: &NodeKind) -> Result<Box<dyn NodeExecutor>, String> {
    Ok(match kind {
        NodeKind::BrightnessContrast { brightness, contrast } => Box::new(
            color::BrightnessContrastNode {
                brightness: *brightness,
                contrast: *contrast,
            },
        ),
        NodeKind::Grayscale { amount } => {
            Box::new(color::GrayscaleNode { amount: *amount })
        }
        NodeKind::Saturation { amount } => {
            Box::new(color::SaturationNode { amount: *amount })
        }
        NodeKind::HueShift { degrees } => {
            Box::new(color::HueShiftNode { degrees: *degrees })
        }
        NodeKind::Invert { amount } => {
            Box::new(color::InvertNode { amount: *amount })
        }
        NodeKind::Blur { radius } => {
            Box::new(filter::BlurNode { radius: *radius })
        }
        NodeKind::Sharpen { amount } => {
            Box::new(filter::SharpenNode { amount: *amount })
        }
        NodeKind::Noise { amount } => {
            Box::new(filter::NoiseNode { amount: *amount })
        }
        NodeKind::Vignette { amount, softness } => Box::new(effect::VignetteNode {
            amount: *amount,
            softness: *softness,
        }),
        NodeKind::ImageInput | NodeKind::Output => {
            return Err("ImageInput/Output should not reach make_executor".into())
        }
    })
}
