"""Creates the original SwipeUp City color palette as Unreal Material assets.

Run inside Unreal Editor 5.5 with PythonScriptPlugin and EditorScriptingUtilities.
This is source automation, not a prebuilt .uasset. Safe to run again.
"""

import unreal

ROOT = "/Game/SwipeUpCity/Materials"
MASTER = "M_CityPalette"

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


def setup():
    unreal.EditorAssetLibrary.make_directory(ROOT)
    master = create_asset(MASTER, unreal.Material, unreal.MaterialFactoryNew())
    ml = unreal.MaterialEditingLibrary

    if ml.get_num_material_expressions(master) == 0:
        color_expr = ml.create_material_expression(
            master, unreal.MaterialExpressionVectorParameter, -350, -220
        )
        color_expr.set_editor_property("parameter_name", unreal.Name("CityColor"))
        color_expr.set_editor_property("default_value", unreal.LinearColor(0.8, 0.8, 0.8, 1))
        ml.connect_material_property(color_expr, "", unreal.MaterialProperty.MP_BASE_COLOR)

        rough_expr = ml.create_material_expression(
            master, unreal.MaterialExpressionScalarParameter, -350, 20
        )
        rough_expr.set_editor_property("parameter_name", unreal.Name("Roughness"))
        rough_expr.set_editor_property("default_value", 0.85)
        ml.connect_material_property(rough_expr, "", unreal.MaterialProperty.MP_ROUGHNESS)

        metal_expr = ml.create_material_expression(
            master, unreal.MaterialExpressionScalarParameter, -350, 220
        )
        metal_expr.set_editor_property("parameter_name", unreal.Name("Metalness"))
        metal_expr.set_editor_property("default_value", 0.0)
        ml.connect_material_property(metal_expr, "", unreal.MaterialProperty.MP_METALLIC)

        ml.recompile_material(master)
    unreal.EditorAssetLibrary.save_asset(ROOT + "/" + MASTER, only_if_is_dirty=False)

    for name, (hex_color, roughness, metalness) in PALETTE.items():
        instance = create_asset(
            "MI_" + name,
            unreal.MaterialInstanceConstant,
            unreal.MaterialInstanceConstantFactoryNew(),
        )
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
