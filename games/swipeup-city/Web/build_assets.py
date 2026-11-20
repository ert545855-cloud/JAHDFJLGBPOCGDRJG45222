#!/usr/bin/env python3
"""Copy Mercan Limanı's web assets and export the matching native world data."""

import argparse
import json
import re
import shutil
from decimal import Decimal
from pathlib import Path


NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?[fF]?"
VECTOR = rf"FVector\s*\(\s*({NUMBER})\s*,\s*({NUMBER})\s*,\s*({NUMBER})\s*\)"
ROTATOR = VECTOR.replace("FVector", "FRotator")
LABEL = r'TEXT\("((?:[^"\\]|\\.)*)"\)'
BRACED = r"\{([^{}]*)\}"
IDENTIFIER = r"[A-Za-z_]\w*"


def require(condition, description):
    if not condition:
        raise ValueError(description)


def one(source, pattern, description):
    matches = list(re.finditer(pattern, source, re.MULTILINE | re.DOTALL))
    require(len(matches) == 1, f"Expected one native {description}, found {len(matches)}")
    return matches[0]


def elements(source, pattern, description):
    entries = re.compile(pattern, re.DOTALL)
    matches = list(entries.finditer(source))
    remainder = entries.sub("@", source)
    require(re.fullmatch(r"\s*@(\s*,\s*@)*\s*,?\s*", remainder),
            f"Unrecognized native {description} syntax")
    return [match.groups() for match in matches]


def initializer(source, declaration, description):
    return one(source, declaration + r"\s*=\s*\{(.*?)\}\s*;", description)[1]


def number(value):
    decimal = Decimal(value.rstrip("fF"))
    return int(decimal) if decimal == decimal.to_integral_value() else float(decimal)


def point(values):
    return [number(value) for value in values]


def label(value):
    return json.loads(f'"{value}"')


def heading(values):
    pitch, yaw, roll = point(values)
    require(pitch == roll == 0, "Web headings require level native rotations")
    return yaw


def enumeration(rules, name):
    definition = one(rules, rf"\benum class {name}\s*:\s*int\s*{BRACED}\s*;", name)[1]
    members = [member for member, in elements(definition, rf"({IDENTIFIER})", name)]
    require(members[0] == "None" and members[-1] == "Count" and len(set(members)) == len(members),
            f"Unexpected native {name} members")
    return members[1:-1]


def std_array(rules, record, name):
    size = int(one(rules, rf"\bstd::array<{record},\s*(\d+)>\s+{name}\b", name)[1])
    nested = initializer(rules, rf"\b{name}", name)
    return size, one(nested, r"^\s*\{(.*)\}\s*$", name)[1]


def parse_vehicles(rules, life, mode):
    fields = (
        "Price", "TopSpeed", "Acceleration", "TurnRate", "HalfLength", "HalfWidth",
        "Axle", "WheelSide", "WheelRadius", "BodyHeight",
    )
    vehicle = one(rules, rf"\bstruct Vehicle\s*{BRACED}", "Vehicle struct")[1]
    field_pattern = r"\s*int\s+Price\s*;" + "".join(
        rf"\s*float\s+{field}\s*;" for field in fields[1:]
    )
    require(re.fullmatch(field_pattern + r"\s*", vehicle), "Unexpected native vehicle spec layout")
    size, raw_specs = std_array(rules, "Vehicle", "Vehicles")
    specs = elements(raw_specs, r"\{\s*" + r"\s*,\s*".join(f"({NUMBER})" for _ in fields) + r"\s*\}",
                     "vehicle specs")
    names = elements(initializer(life, r"\bCars\[\]", "car names"), LABEL, "car names")
    one(mode, r"const float Height\s*=\s*SwipeUpCityLife::Vehicles\[Style\]\.BodyHeight\s*;\s*"
        r"const FTransform Transform\(FRotator\(0, Yaw, 0\), FVector\(Point\.X, Point\.Y, Height\)\);",
        "car spawn transform")
    spawn_pattern = rf"\bSpawnCar\s*\(\s*{VECTOR}\s*,\s*({NUMBER})\s*,\s*(\d+)\s*\)\s*;"
    spawns = [match.groups() for match in re.finditer(spawn_pattern, mode)]
    require(size == len(specs) == len(names) == len(spawns) == 6, "Expected six native cars")
    require(len(re.findall(r"\bSpawnCar\s*\(", mode)) == len(spawns), "Unrecognized native car spawn")
    require(sorted(int(spawn[4]) for spawn in spawns) == list(range(size)), "Invalid native car styles")

    vehicles = []
    keys = [field[0].lower() + field[1:] for field in fields]
    for x, y, _, yaw, style in sorted(spawns, key=lambda row: int(row[4])):
        identifier = int(style)
        spec = dict(zip(keys, map(number, specs[identifier])))
        require(spec["price"] >= 0 and all(spec[key] > 0 for key in keys[1:]),
                f"Invalid native vehicle specs for style {identifier}")
        vehicles.append(dict(id=identifier, name=label(names[identifier][0]),
                             position=[number(x), number(y), spec["bodyHeight"]], heading=number(yaw), **spec))
    return vehicles


def parse_life(rules, life):
    places = enumeration(rules, "Place")
    jobs = enumeration(rules, "Job")
    raw_stations = initializer(life, r"\bStations\[\]", "Life stations")
    placeholder = r'\s*\{\s*TEXT\(""\)\s*,\s*FVector::ZeroVector\s*,\s*0\s*\}\s*,'
    without_placeholder, removed = re.subn("^" + placeholder, "", raw_stations)
    require(removed == 1, "Expected the native None station")
    stations = elements(without_placeholder, rf"\{{\s*{LABEL}\s*,\s*{VECTOR}\s*,\s*({NUMBER})\s*\}}",
                        "Life stations")
    require(len(stations) == len(places), "Native Life stations must match the Place enum")
    stations = [dict(id=identifier, name=label(name), position=point(position), radius=number(radius))
                for identifier, (name, *position, radius) in zip(places, stations)]
    require(all(station["radius"] > 0 for station in stations), "Invalid native Life station radius")

    size, raw_shifts = std_array(rules, "Shift", "Shifts")
    step = rf"\{{\s*Place::({IDENTIFIER})\s*,\s*(true|false)\s*\}}"
    shift_pattern = (rf"\{{\s*Place::({IDENTIFIER})\s*,\s*\{{\s*\{{(.*?)\}}\s*\}}"
                     r"\s*,\s*(\d+)\s*,\s*(\d+)\s*\}")
    shifts = elements(raw_shifts, shift_pattern, "career shifts")
    require(len(shifts) == len(jobs) == size, "Native career shifts must match the Job enum")
    careers = []
    for identifier, (employer, entries, length, pay) in zip(jobs, shifts):
        steps = elements(entries, step, f"{identifier} career steps")
        length = int(length)
        require(employer in places and 0 < length <= len(steps), f"Invalid native {identifier} career")
        require(all(station in places for station, _ in steps[:length])
                and all(entry == ("None", "false") for entry in steps[length:]),
                f"Invalid native {identifier} career stations")
        careers.append(dict(id=identifier, employer=employer, pay=int(pay), steps=[
            dict(station=station, vehicle=vehicle == "true") for station, vehicle in steps[:length]
        ]))
    return stations, careers


def parse_people(mode):
    raw_loops = initializer(mode, r"\bPedestrianLoops\[\]", "pedestrian loops")
    loops = [[point(vector) for vector in elements(loop, VECTOR, "pedestrian waypoints")]
             for loop, in elements(raw_loops, BRACED, "pedestrian loops")]
    require(all(len(loop) >= 2 for loop in loops), "Native pedestrian loops need at least two points")
    count = one(mode, r"Person\s*<\s*\(Route\s*<\s*(\d+)\s*\?\s*(\d+)\s*:\s*(\d+)\)",
                "pedestrians per route")
    early_routes, early_count, late_count = map(int, count.groups())
    settings = one(mode, rf"Configure\(Points,\s*({NUMBER})\s*\+\s*\(\(Route \* (\d+) \+ Person \* (\d+)\)"
                   rf" % (\d+)\),\s*Person,\s*({NUMBER})\s*\+\s*\(\(Person \+ Route\) % (\d+)\)"
                   rf" \* ({NUMBER}),\s*\(Person \+ Route\) % (\d+)\s*\);", "pedestrian settings")
    base_speed, route_speed, person_speed, speed_cycle, base_scale, scale_cycle, scale_step, styles = (
        Decimal(value.rstrip("fF")) for value in settings.groups()
    )
    pedestrians = []
    for route, waypoints in enumerate(loops):
        for person in range(early_count if route < early_routes else late_count):
            speed = base_speed + (route * route_speed + person * person_speed) % speed_cycle
            scale = base_scale + (person + route) % scale_cycle * scale_step
            pedestrians.append(dict(waypoints=waypoints, speed=number(str(speed)), startIndex=person,
                                    scale=number(str(scale)), style=int((person + route) % styles)))

    raw_social = initializer(mode, r"\bSocialSpots\[\]", "social spots")
    social_spots = elements(raw_social, VECTOR, "social spots")
    social_pattern = rf"ConfigureActivity\(SocialSpots\[Index\],\s*{ROTATOR},\s*Index \* ({NUMBER}),\s*Index % (\d+)\);"
    *rotation, phase_step, social_styles = one(mode, social_pattern, "social settings").groups()
    phase_step = Decimal(phase_step.rstrip("fF"))
    social = [dict(position=point(vector), heading=heading(rotation), phase=number(str(index * phase_step)),
                   style=index % int(social_styles)) for index, vector in enumerate(social_spots)]
    return pedestrians, social


def build(output):
    game = Path(__file__).resolve().parents[1]
    source = game / "Source/SwipeUpCity"
    harbor = (source / "SwipeUpCityHarborGeometry.inl").read_text(encoding="utf-8")
    mode = (source / "SwipeUpCityGameMode.cpp").read_text(encoding="utf-8")
    life = (source / "SwipeUpCityLife.cpp").read_text(encoding="utf-8")
    rules = (source / "SwipeUpCityLifeRules.h").read_text(encoding="utf-8")

    meshes = sorted((game / "Content/SwipeUpCity/Meshes").glob("*.scmesh"))
    require(len(meshes) == 45, f"Expected 45 native meshes, found {len(meshes)}")
    names = [path.stem for path in meshes]
    harbor_names = [label(value) for value, in elements(
        initializer(harbor, r"\bHarborMeshNames\[\]", "harbor meshes"), LABEL, "harbor meshes"
    )]
    require(len(set(harbor_names)) == len(harbor_names) and set(harbor_names) <= set(names),
            "Native harbor meshes must be unique and present on disk")
    solids = [dict(center=point(values[:3]), size=point(values[3:])) for values in elements(
        initializer(harbor, r"\bHarborSolids\[\]", "harbor solids"),
        rf"\{{\s*{VECTOR}\s*,\s*{VECTOR}\s*\}}", "harbor solids"
    )]
    require(all(min(solid["size"]) > 0 for solid in solids), "Invalid native harbor solid dimensions")

    spawn = point(one(mode, VECTOR.replace("FVector", r"\bFVector\s+Plaza"), "plaza spawn").groups())
    spawn_heading = heading(one(mode, ROTATOR.replace("FRotator", r"\bFRotator\s+PlazaHeading"),
                                "plaza rotation").groups())
    radius = number(one(mode, rf"\bStopRadius\s*=\s*({NUMBER})\s*;", "tour stop radius")[1])
    require(radius > 0, "Invalid native tour stop radius")
    tour = [dict(name=label(name), position=point(position), radius=radius) for name, *position in elements(
        initializer(mode, r"\bStops\[\]", "tour stops"), rf"\{{\s*{LABEL}\s*,\s*{VECTOR}\s*\}}", "tour stops"
    )]
    stations, jobs = parse_life(rules, life)
    pedestrians, social = parse_people(mode)
    world = dict(schema=1, units="cm", meshes=names, harborMeshes=harbor_names, solids=solids,
                 spawn=dict(position=spawn, heading=spawn_heading), vehicles=parse_vehicles(rules, life, mode),
                 tour=tour, stations=stations, jobs=jobs, pedestrians=pedestrians, social=social)

    three = game.parents[1] / "node_modules/three"
    three_files = [three / "build/three.module.js", three / "build/three.core.js", three / "LICENSE"]
    require(all(path.is_file() for path in three_files), "Install the repository's Three.js dependency first")
    mesh_output = output / "meshes"
    three_output = output / "vendor/three"
    extra_meshes = sorted(path.name for path in mesh_output.glob("*.scmesh") if path.stem not in names)
    require(not extra_meshes, f"Unexpected mesh files in {mesh_output}: {', '.join(extra_meshes)}")
    mesh_output.mkdir(parents=True, exist_ok=True)
    three_output.mkdir(parents=True, exist_ok=True)
    for path in meshes:
        shutil.copyfile(path, mesh_output / path.name)
    for path in three_files:
        shutil.copyfile(path, three_output / path.name)
    (output / "world.json").write_text(json.dumps(world, ensure_ascii=False, allow_nan=False, indent=2) + "\n",
                                       encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path, help="Directory for the web assets")
    arguments = parser.parse_args()
    try:
        build(arguments.output)
    except (OSError, ValueError, ArithmeticError) as error:
        parser.exit(1, f"Mercan Limanı assets: {error}\n")
