"""Import local FBX, GLB and glTF files. Run in Unreal Editor 5.5.

Keep each pack, including the .bin and textures used by its glTF files, under
ExternalAssets/<pack>/. This directory and the imported packages are Git-ignored.
Unreal-format products should be added via Fab in Unreal.
"""

from pathlib import Path
import re

import unreal


SOURCE = Path(unreal.Paths.project_dir()).resolve() / "ExternalAssets"
DEST = "/Game/SwipeUpCity/ImportedFab"
EXTENSIONS = {".fbx", ".glb", ".gltf"}


def package_name(name):
    return re.sub(r"[^A-Za-z0-9_]", "_", name).strip("_")[:60] or "Asset"


def import_assets():
    if not SOURCE.is_dir():
        unreal.log("SwipeUp City: no local asset packs under ExternalAssets.")
        return

    tasks = []
    directories = set()
    for file in sorted(SOURCE.rglob("*")):
        if not file.is_file() or file.suffix.lower() not in EXTENSIONS:
            continue

        parts = file.relative_to(SOURCE).parts[:-1] or ("LooseAssets",)
        folders = "/".join(map(package_name, parts))
        # Separate imports with the same stem so their mesh/material names can coexist.
        destination = f"{DEST}/{folders}/{package_name(file.stem)}_{file.suffix[1:].lower()}"
        if destination.casefold() in directories:
            unreal.log_warning(f"SwipeUp City: duplicate destination for {file.relative_to(SOURCE)}.")
            continue
        directories.add(destination.casefold())

        task = unreal.AssetImportTask()
        task.set_editor_property("filename", str(file))
        task.set_editor_property("destination_path", destination)
        task.set_editor_property("automated", True)
        task.set_editor_property("replace_existing", False)
        task.set_editor_property("save", True)
        tasks.append((file, task))

    if not tasks:
        unreal.log("SwipeUp City: no .fbx, .glb or .gltf files found.")
        return

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task for _, task in tasks])
    for file, task in tasks:
        # get_objects waits for Interchange results when the import is asynchronous.
        imported = task.get_objects()
        meshes = [asset.get_path_name() for asset in imported if isinstance(asset, unreal.StaticMesh)]
        if not meshes:
            unreal.log_warning(f"SwipeUp City: {file.relative_to(SOURCE)} yielded no static meshes. Check the import log or existing assets in {task.get_editor_property('destination_path')}.")
            continue

        for mesh in meshes:
            unreal.log(f"SwipeUp City static mesh: {mesh}")


if __name__ == "__main__":
    import_assets()
