"""Optional FBX importer for legitimately downloaded Fab files.

Usage INSIDE Unreal editor scripting environment only:
  1. In the project directory create ExternalAssets/<pack-name>/.../*.fbx
  2. Run this script with -ExecutePythonScript after launching the editor.
  3. It imports meshes locally into /Game/SwipeUpCity/ImportedFab.
Do NOT commit this content to a public repository by default.
Unreal Engine-format Fab products (.uasset) should be added through Fab in Unreal
or their original project's content migration workflow, not this FBX importer.
"""

from pathlib import Path
import os
import re
import unreal

PROJECT_DIR = Path(unreal.Paths.project_dir())
SOURCE = PROJECT_DIR / "ExternalAssets"
DEST = "/Game/SwipeUpCity/ImportedFab"


def clean_name(name):
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", name)[:60]
    return cleaned or "FabAsset"


def import_fbx():
    if not SOURCE.exists():
        unreal.log_warning("SwipeUp City: no ExternalAssets directory, skipping.")
        return

    tasks = []
    for file in sorted(SOURCE.rglob("*.fbx")):
        pack = clean_name(file.relative_to(SOURCE).parts[0])
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", str(file))
        task.set_editor_property("destination_path", DEST + "/" + pack)
        task.set_editor_property("automated", True)
        task.set_editor_property("replace_existing", False)
        task.set_editor_property("save", True)
        tasks.append(task)

    if not tasks:
        unreal.log_warning("SwipeUp City: no FBX file found in ExternalAssets.")
        return
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
    count = sum(len(t.get_editor_property("imported_object_paths")) for t in tasks)
    unreal.log("SwipeUp City: imported {} local assets. Review LODs and collision.".format(count))


if __name__ == "__main__":
    import_fbx()
