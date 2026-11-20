using UnrealBuildTool;
public class SwipeUpCityEditorTarget : TargetRules
{
    public SwipeUpCityEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        ExtraModuleNames.Add("SwipeUpCity");
    }
}
