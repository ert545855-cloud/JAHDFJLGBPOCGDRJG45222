# Coastal social city map v0.2

Built procedurally at runtime in SwipeUpCityBlockout.cpp, no externally
redistributed Fab files.

## Districts
- Central boulevard grid: seven north/south + seven east/west streets
- Residential quarter: cream and terracotta apartment buildings
- Business quarter: blue/glass mid-rise towers and illuminated trim
- Central social park: palms, footpaths, a fountain and benches
- Cafe square: outdoor tables and shade umbrellas
- Southern coast: wooden boardwalk, beach, palm-lined promenade
- Marina: pier and low-poly static boat silhouettes
- Distant hills: mobile-friendly geometry to frame horizon

## Technical implementation
- InstancedStaticMesh Components: one draw-batching layer per material.
- Static collision on terrain / buildings; lightweight detail layers without collision.
- 19 material instances can be generated locally via Scripts/generate_city_materials.py.
- Ground, buildings, trees and roads use Unreal's built-in cube/cone placeholders.
- Sky/directional lighting is set at runtime; not a production day/night system.
- All locations use centimeters. Grid size is 2400 cm.
- Character camera and touch controls live under Source/SwipeUpCity.
- The editor default map is /Engine/Maps/Entry; CityBlockout is spawned in GameMode.
  A saved .umap will only exist after generating and saving it in Unreal Editor.

## Quality checklist before calling it a playable mobile game
[ ] Build with Unreal 5.5 C++ compiler
[ ] Generate and save the 19 materials from editor Python
[ ] Run in Android emulator/real phone; then iOS
[ ] Inspect collisions, road alignment, camera and gameplay spawn
[ ] Fix prototype art quality and author real building facades with Fab meshes
[ ] Test fps, GPU time, draw calls, device temperatures and texture budget
[ ] Bake static lighting where appropriate; configure mobile rendering profiles
[ ] Validate accessibility, menu/Unreal native integration, and navigation
[ ] Add server authentication, multiplayer, voice/text moderation and persistence

No Unreal runtime compilation / map screenshots / device test were performed in ChatGPT.
