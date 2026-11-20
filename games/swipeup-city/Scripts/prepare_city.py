"""Prepare the native harbor materials and import any local art."""

from pathlib import Path
import runpy

import unreal


SCRIPTS = Path(__file__).resolve().parent
ART = "/Game/SwipeUpCity/CityArt"
BENCH = ART + "/SM_CityBench"


def import_city_bench():
    if unreal.EditorAssetLibrary.does_asset_exist(BENCH):
        return

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(SCRIPTS.parent / "Assets/CC0/painted_wooden_bench.glb"))
    task.set_editor_property("destination_path", ART)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", False)
    task.set_editor_property("save", True)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

    meshes = [obj for obj in task.get_objects() if isinstance(obj, unreal.StaticMesh)]
    if len(meshes) == 1 and unreal.EditorAssetLibrary.rename_asset(meshes[0].get_path_name(), BENCH):
        unreal.EditorAssetLibrary.save_asset(BENCH)
    else:
        unreal.log_warning("SwipeUp City: bundled bench import did not finish. The original bench will be used.")


if __name__ == "__main__":
    runpy.run_path(str(SCRIPTS / "generate_harbor_materials.py"), run_name="__main__")
    runpy.run_path(str(SCRIPTS / "generate_city_materials.py"), run_name="__main__")
    import_city_bench()
    runpy.run_path(str(SCRIPTS / "import_local_fab_fbx.py"), run_name="__main__")
