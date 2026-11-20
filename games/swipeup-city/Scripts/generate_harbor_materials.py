"""Create mobile-friendly vertex-color materials for the original harbor."""

import unreal

ROOT = "/Game/SwipeUpCity/HarborMaterials"
MATERIALS = [
    ("Matte", .84, .0, .0, False),
    ("Glass", .28, .14, .0, False),
    ("Lamp", .39, .0, .45, False),
    ("Fabric", .74, .0, .0, False),
    ("Water", .34, .04, .0, False),
    ("Sky", .84, .0, 1.0, True),
    ("Paint", .23, .23, .0, False),
]


def scalar(editor, material, value, x, y):
    node = editor.create_material_expression(material, unreal.MaterialExpressionConstant, x, y)
    node.set_editor_property("r", value)
    return node


def water_color(editor, material, color):
    world = editor.create_material_expression(material, unreal.MaterialExpressionWorldPosition, -800, 0)
    seconds = editor.create_material_expression(material, unreal.MaterialExpressionTime, -800, 200)
    ripples = editor.create_material_expression(material, unreal.MaterialExpressionCustom, -520, 120)
    world_input = unreal.CustomInput()
    world_input.set_editor_property("input_name", "Position")
    time_input = unreal.CustomInput()
    time_input.set_editor_property("input_name", "Seconds")
    ripples.set_editor_property("inputs", [world_input, time_input])
    ripples.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT1)
    ripples.set_editor_property("code", """
        float2 p = Position.xy * 0.014;
        return 0.95 + 0.045 * sin(p.x + p.y - Seconds * 1.9)
                    + 0.025 * sin(p.x * 2.4 - p.y * 1.6 + Seconds * 3.2);
    """)
    editor.connect_material_expressions(world, "", ripples, "Position")
    editor.connect_material_expressions(seconds, "", ripples, "Seconds")
    scale = editor.create_material_expression(material, unreal.MaterialExpressionMultiply, -230, -110)
    editor.connect_material_expressions(color, "", scale, "A")
    editor.connect_material_expressions(ripples, "", scale, "B")
    return scale


def create_material(name, roughness, metal, glow, unlit):
    assets = unreal.EditorAssetLibrary
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    editor = unreal.MaterialEditingLibrary
    asset_name = "M_Harbor" + name
    path = ROOT + "/" + asset_name
    if assets.does_asset_exist(path):
        material = assets.load_asset(path)
    else:
        material = tools.create_asset(asset_name, ROOT, unreal.Material, unreal.MaterialFactoryNew())
    if material is None:
        raise RuntimeError("SwipeUp City could not create " + path)
    if editor.get_num_material_expressions(material) > 0:
        return

    material.set_editor_property("two_sided", True)
    if unlit:
        material.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
        material.set_editor_property("is_sky", True)
    color = editor.create_material_expression(material, unreal.MaterialExpressionVertexColor, -820, -220)
    base = water_color(editor, material, color) if name == "Water" else color
    props = unreal.MaterialProperty
    if not unlit:
        editor.connect_material_property(base, "", props.MP_BASE_COLOR)
        editor.connect_material_property(scalar(editor, material, roughness, -220, 190), "", props.MP_ROUGHNESS)
        editor.connect_material_property(scalar(editor, material, metal, -220, 310), "", props.MP_METALLIC)
    if glow:
        emission = color
        if glow < 1.0:
            emission = editor.create_material_expression(material, unreal.MaterialExpressionMultiply, -170, -120)
            editor.connect_material_expressions(color, "", emission, "A")
            editor.connect_material_expressions(scalar(editor, material, glow, -550, -70), "", emission, "B")
        editor.connect_material_property(emission, "", props.MP_EMISSIVE_COLOR)
    editor.recompile_material(material)
    assets.save_loaded_asset(material, only_if_is_dirty=False)


if __name__ == "__main__":
    unreal.EditorAssetLibrary.make_directory(ROOT)
    for settings in MATERIALS:
        create_material(*settings)
    unreal.log("SwipeUp City: seven native harbor materials ready.")
