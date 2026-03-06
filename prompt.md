I am building a desktop app called Prism.

Context:
- Prism is a node-based image graphics editor.
- Think Blender’s node editor, but focused on processing a single image at a time.
- The frontend is already being built in TypeScript and will remain a web-style UI.
- I am converting the app into a lightweight desktop app using Tauri.
- I want to keep the frontend in TypeScript and build the processing engine in Rust through Tauri.
- The goal is near-real-time preview while chaining image-processing nodes.
- This is not a layer-based Photoshop clone. It is a node playground for image manipulation and stylized art creation.
- Users should be able to chain nodes like brightness, contrast, saturation, hue shift, invert, blur, sharpen, noise, vignette, pixelation, dithering, mapping/transform nodes, math nodes, blend nodes, etc.
- The app is intended for one image at a time, not multi-document heavy compositing.

I want you to act as a senior software architect and help me properly plan and scaffold this app.

Your job:
Design a production-minded architecture for Prism using this stack:
- Frontend: TypeScript
- Desktop shell: Tauri
- Backend / processing engine: Rust

Core technical direction:
- Use a hybrid processing approach:
  - CPU pipeline in Rust for simpler and foundational nodes
  - GPU pipeline later for more advanced stylized effects
- Start with a CPU-first architecture that is easy to ship and maintain
- Prepare the architecture so GPU-backed nodes can be added later without rewriting the system
- The graph engine should support caching, dirty node invalidation, partial recomputation, and lower-resolution preview rendering
- Final exports should run at full resolution
- The backend should be designed around a node graph executor, not a pile of individual one-off commands

Recommended backend approach:
- Rust crates to consider:
  - image
  - imageproc
  - fast_image_resize
  - glam
- The system should be designed so wgpu can be introduced later for GPU shader nodes
- Do not design this as “everything in shaders from day one”
- Do not make the frontend responsible for image processing

What I need from you:
1. Propose a clean system architecture for Prism
2. Define the project structure for both frontend and Rust backend
3. Define the node graph data model
4. Define how nodes, sockets, parameters, and connections should be represented
5. Explain how the execution engine should work
6. Explain how dirty-state propagation and caching should work
7. Explain how preview rendering vs full export rendering should work
8. Define a good boundary between TypeScript frontend and Rust backend
9. Recommend Tauri command patterns and backend API shape
10. Suggest how image data should be passed, stored, and referenced efficiently
11. Recommend what should be implemented first vs later
12. Scaffold the initial code structure for the Rust backend and Tauri integration
13. Provide example Rust types and traits for:
   - NodeId
   - Edge / Connection
   - NodeKind
   - NodeParameterValue
   - Graph
   - ExecutionContext
   - NodeExecutor trait
   - CachedImage
14. Propose an MVP node set for version 1
15. Classify which nodes should be CPU first vs GPU later
16. Explain performance concerns and how to avoid unnecessary recomputation
17. Recommend a development roadmap in phases
18. Show example pseudocode or starter code for graph evaluation
19. Suggest how to support future custom shader nodes
20. Suggest how to organize testing for graph correctness and image output

Important constraints:
- Keep the app lightweight
- Keep the system modular and maintainable
- Prioritize fast iteration and a realistic MVP
- Avoid overengineering
- Avoid giant abstractions that don’t help
- Prefer practical architecture over theoretical purity
- The answer should be opinionated and decisive
- When there are tradeoffs, explain which path you recommend and why

Desired output format:
Please structure your response exactly like this:

1. High-level architecture
2. Frontend/backend responsibility split
3. Recommended project folder structure
4. Graph engine design
5. Core Rust data types
6. Execution model
7. Caching and invalidation strategy
8. Preview/export strategy
9. Tauri integration plan
10. MVP node list
11. CPU-first nodes vs GPU-later nodes
12. Performance strategy
13. Step-by-step implementation roadmap
14. Initial scaffolded Rust code
15. Risks / pitfalls to avoid

After the architecture plan, generate starter code for the Rust side that includes:
- a basic graph model
- a node enum
- a simple evaluator
- 2–3 sample node implementations
- Tauri command examples
- room for future GPU node support

Make reasonable assumptions where needed and explicitly state them.
Do not stay high-level only. I want concrete architecture and starter code.