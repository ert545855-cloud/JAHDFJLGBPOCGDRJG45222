using UnrealBuildTool;
public class SwipeUpCityTarget : TargetRules
{
    public SwipeUpCityTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        ExtraModuleNames.Add("SwipeUpCity");
    }
}
