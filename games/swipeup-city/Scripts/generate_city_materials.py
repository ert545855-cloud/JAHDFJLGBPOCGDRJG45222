"""Creates the original SwipeUp City color palette as Unreal Material assets.

Run inside Unreal Editor 5.5 with PythonScriptPlugin and EditorScriptingUtilities.
This is source automation, not a prebuilt .uasset. Safe to run again.
"""

from pathlib import Path

import unreal

ROOT = "/Game/SwipeUpCity/Materials"
MASTER = "M_CityPalette"
ART = "/Game/SwipeUpCity/CityArt"
SOURCE = Path(__file__).resolve().parent.parent / "Assets/CC0"
SURFACES = {
    "Road": ("asphalt", 275.0, "#9aa0ac"),
    "Sidewalk": ("pavers", 192.0, "#eaddc6"),
    "Beach": ("sand", 360.0, "#efce97"),
    "Cream": ("plaster", 210.0, "#f4dcc0"),
    "Terracotta": ("plaster", 210.0, "#cf927a"),
    "BlueWall": ("plaster", 210.0, "#92aeb6"),
    "Timber": ("deck", 160.0, "#d3b693"),
}

# Names must match LayerNames in SwipeUpCityBlockout.cpp
# color hex, roughness, metallic
PALETTE = {
    "Terrain": ("#718a68", 0.95, 0.0),
    "Road": ("#303340", 0.96, 0.0),
    "Sidewalk": ("#b0b8b9", 0.88, 0.0),
    "Beach": ("#e8c98e", 0.95, 0.0),
    "Sea": ("#3ea7c7", 0.23, 0.02),
    "Lawn": ("#59a77a", 0.94, 0.0),
    "Line": ("#f9f1dc", 0.82, 0.0),
    "Concrete": ("#d1d0c6", 0.84, 0.0),
    "Cream": ("#f4d9bb", 0.83, 0.0),
    "Terracotta": ("#dc8777", 0.83, 0.0),
    "BlueWall": ("#738cad", 0.64, 0.05),
    "Glass": ("#82d2e0", 0.23, 0.28),
    "Roof": ("#38495a", 0.84, 0.0),
    "Iron": ("#425163", 0.68, 0.28),
    "Timber": ("#a66b50", 0.9, 0.0),
    "Trunk": ("#9a7549", 0.9, 0.0),
    "Leaf": ("#309c77", 0.88, 0.0),
    "PinkAccent": ("#f271ac", 0.48, 0.0),
    "GoldAccent": ("#ffc36f", 0.44, 0.12),
}


def linear_color(h):
    values = [int(h[k:k+2], 16) / 255.0 for k in (1, 3, 5)]
    values = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]
    return unreal.LinearColor(values[0], values[1], values[2], 1)


def create_asset(name, asset_class, factory):
    path = ROOT + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.EditorAssetLibrary.load_asset(path)
    return unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, ROOT, asset_class, factory)


def load_surface(name):
    path = f"{ART}/{name}"
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.EditorAssetLibrary.load_asset(path)

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(SOURCE / (name + ".jpg")))
    task.set_editor_property("destination_path", ART)
    task.set_editor_property("destination_name", name)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    return next((obj for obj in task.get_objects() if isinstance(obj, unreal.Texture2D)), None)


def create_master(name, aligned_function=None, sample_texture=None):
    master = create_asset(name, unreal.Material, unreal.MaterialFactoryNew())
    ml = unreal.MaterialEditingLibrary
    if ml.get_num_material_expressions(master) > 0:
        return master

    color = ml.create_material_expression(master, unreal.MaterialExpressionVectorParameter, -660, -220)
    color.set_editor_property("parameter_name", unreal.Name("CityColor"))
    color.set_editor_property("default_value", unreal.LinearColor(0.8, 0.8, 0.8, 1))
    base = color

    if aligned_function and sample_texture:
        source = ml.create_material_expression(master, unreal.MaterialExpressionTextureObjectParameter, -780, 40)
        source.set_editor_property("parameter_name", unreal.Name("SurfaceTexture"))
        source.set_editor_property("texture", sample_texture)
        tile = ml.create_material_expression(master, unreal.MaterialExpressionVectorParameter, -780, 280)
        tile.set_editor_property("parameter_name", unreal.Name("TileSize"))
        tile.set_editor_property("default_value", unreal.LinearColor(210, 210, 210, 1))
        aligned = ml.create_material_expression(master, unreal.MaterialExpressionMaterialFunctionCall, -480, 40)
        aligned.set_material_function(aligned_function)
        multiply = ml.create_material_expression(master, unreal.MaterialExpressionMultiply, -210, -170)
        connections = [
            ml.connect_material_expressions(source, "", aligned, "TextureObject"),
            ml.connect_material_expressions(tile, "RGB", aligned, "TextureSize"),
            ml.connect_material_expressions(aligned, "XYZ Texture", multiply, "A"),
            ml.connect_material_expressions(color, "RGB", multiply, "B"),
        ]
        if not all(connections):
            unreal.log_warning("SwipeUp City: could not connect world-aligned texture. Using solid materials.")
            ml.delete_all_material_expressions(master)
            return None
        base = multiply

    ml.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)

    rough = ml.create_material_expression(master, unreal.MaterialExpressionScalarParameter, -420, 440)
    rough.set_editor_property("parameter_name", unreal.Name("Roughness"))
    rough.set_editor_property("default_value", 0.85)
    ml.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)

    metal = ml.create_material_expression(master, unreal.MaterialExpressionScalarParameter, -420, 560)
    metal.set_editor_property("parameter_name", unreal.Name("Metalness"))
    metal.set_editor_property("default_value", 0.0)
    ml.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)

    ml.recompile_material(master)
    unreal.EditorAssetLibrary.save_asset(ROOT + "/" + name, only_if_is_dirty=False)
    return master


def setup():
    unreal.EditorAssetLibrary.make_directory(ROOT)
    unreal.EditorAssetLibrary.make_directory(ART)
    ml = unreal.MaterialEditingLibrary
    master = create_master(MASTER)
    aligned = unreal.load_asset(
        "/Engine/Functions/Engine_MaterialFunctions02/Texturing/WorldAlignedTexture.WorldAlignedTexture"
    )
    materials = {}
    textured = None
    if aligned:
        for surface in sorted({data[0] for data in SURFACES.values()}):
            materials[surface] = load_surface(surface)
        if materials["asphalt"]:
            textured = create_master("M_CitySurface", aligned, materials["asphalt"])

    for name, (hex_color, roughness, metalness) in PALETTE.items():
        instance = create_asset(
            "MI_" + name,
            unreal.MaterialInstanceConstant,
            unreal.MaterialInstanceConstantFactoryNew(),
        )
        settings = SURFACES.get(name)
        surface = materials.get(settings[0]) if settings else None
        if surface and textured:
            _, size, hex_color = settings
            ml.set_material_instance_parent(instance, textured)
            ml.set_material_instance_texture_parameter_value(instance, "SurfaceTexture", surface)
            ml.set_material_instance_vector_parameter_value(instance, "TileSize", unreal.LinearColor(size, size, size, 1))
        else:
            ml.set_material_instance_parent(instance, master)
        ml.set_material_instance_vector_parameter_value(
            instance, "CityColor", linear_color(hex_color)
        )
        ml.set_material_instance_scalar_parameter_value(
            instance, "Roughness", float(roughness)
        )
        ml.set_material_instance_scalar_parameter_value(
            instance, "Metalness", float(metalness)
        )
        unreal.EditorAssetLibrary.save_asset(
            ROOT + "/MI_" + name, only_if_is_dirty=False
        )
        unreal.log("SwipeUp City: " + name + " material ready.")

    unreal.log("SwipeUp City: palette generated (19 material instances).")


if __name__ == "__main__":
    setup()
