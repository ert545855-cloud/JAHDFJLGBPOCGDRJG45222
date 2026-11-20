# SwipeUp City — Unreal Engine 5.5 mobile-first city

A standalone source prototype being developed for SwipeUp's existing games menu
and future native Android/iOS app integration.

## Current implementation
- Third-person character, camera, movement, jump and sprint input
- Mobile virtual joystick axes + prototype jump/sprint touch controls
- Procedurally assembled 3D coastal city at runtime (see Docs/CITY_MAP.md)
- Main boulevard, hundreds of facade parts, park/fountain, cafe plaza,
  beach/promenade, marina, palm trees and decorative road infrastructure
- 19 reusable instanced mesh palette layers designed for low draw-call counts
- Unreal Editor Python tool to generate original color materials
- Free Fab asset links and optional local FBX importer

## Generate the palette (in Unreal Editor 5.5)
1. Install Unreal 5.5 and its C++ compiler/SDK dependencies.
2. Open SwipeUpCity.uproject and compile the C++ modules.
3. In Unreal Editor: Tools > Execute Python Script > Scripts/generate_city_materials.py.
   Alternatively set UE_EDITOR_CMD and run Scripts/run_palette_windows.bat.
4. The editor writes material .uasset files under Content/SwipeUpCity/Materials.
5. Choose Play: the GameMode spawns a source-generated test city on Entry map.
6. Test a packaged build on an actual Android/iOS device.

These material .uasset files are generated LOCALLY; they are not in GitHub until
the build environment generates them. Their generated colors are original.

## Fab art
See Docs/FAB_FREE_ASSETS.md and Assets/FabManifest.json. No Fab package has been
downloaded or installed in this repo. Some packs require import through Unreal
Editor's Fab plugin; pure FBX packages can be imported with Scripts/import_local_fab_fbx.py.

## Critical status and integration restrictions
- Code has been committed, but no Unreal compilation or mobile runtime test took place here.
- The game is NOT playable inside the current SwipeUp Capacitor/TWA app yet.
- Procedural layout is a visually structured placeholder, not a finished AAA map.
- Full native one-app integration needs separate technical prototypes on each platform.
- Dedicated servers, actual vehicle controls, persistence and server-issued login
  handoff have not been implemented.
- Do not put Fab raw source files into this public repository.

See Docs/MOBILE_INTEGRATION.md, Docs/CITY_MAP.md and Docs/MILESTONES.md.
