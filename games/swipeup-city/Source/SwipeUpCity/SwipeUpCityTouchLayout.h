#pragma once

#include "CoreMinimal.h"
#include "Math/Box2D.h"

namespace SwipeUpCityTouch
{
    enum class Button : uint8 { Pause, Run, JumpBrake, Vehicle, Restart };

    inline FBox2D Region(Button Control, const FVector2D& Screen)
    {
        const double Size = FMath::Clamp(FMath::Min(Screen.X, Screen.Y) * .118, 44., 76.);
        const double X = Screen.X - Size - 15.;
        const double Y = Control == Button::Pause ? 17. :
            Control == Button::Run ? Screen.Y * .31 :
            Control == Button::JumpBrake ? Screen.Y * .45 :
            Control == Button::Vehicle ? Screen.Y * .59 : Screen.Y * .48;
        if (Control == Button::Restart)
            return FBox2D(FVector2D(Screen.X * .30, Y), FVector2D(Screen.X * .70, Y + Size * .72));
        return FBox2D(FVector2D(X, Y), FVector2D(X + Size, Y + Size * .72));
    }
}
