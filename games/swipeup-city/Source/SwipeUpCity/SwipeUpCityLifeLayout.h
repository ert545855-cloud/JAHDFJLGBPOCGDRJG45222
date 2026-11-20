#pragma once

#include "CoreMinimal.h"
#include "Math/Box2D.h"

namespace SwipeUpCityLifeLayout
{
    inline FBox2D InteractButton(const FVector2D& Screen)
    {
        const double Width = FMath::Clamp(Screen.X * .18, 64., 140.);
        const double Height = FMath::Clamp(Screen.Y * .085, 35., 56.);
        const double Y = Screen.Y * .72;
        return FBox2D(FVector2D((Screen.X - Width) * .5, Y),
            FVector2D((Screen.X + Width) * .5, Y + Height));
    }

    inline FBox2D Panel(const FVector2D& Screen)
    {
        const double Width = FMath::Clamp(Screen.X * .84, 220., 650.);
        return FBox2D(FVector2D((Screen.X - Width) * .5, Screen.Y * .045),
            FVector2D((Screen.X + Width) * .5, Screen.Y * .955));
    }

    inline FBox2D CloseButton(const FVector2D& Screen)
    {
        const FBox2D Menu = Panel(Screen);
        const double Height = FMath::Min(37., Screen.Y * .095);
        return FBox2D(FVector2D(Menu.Max.X - 54., Menu.Min.Y + 5.),
            FVector2D(Menu.Max.X - 7., Menu.Min.Y + 5. + Height));
    }

    inline FBox2D Row(const FVector2D& Screen, int32 Index, int32 Count)
    {
        const FBox2D Menu = Panel(Screen);
        const double Header = FMath::Clamp(Screen.Y * .121, 42., 62.);
        const double Footer = FMath::Clamp(Screen.Y * .09, 31., 50.);
        const double Step = FMath::Min(51., (Menu.GetSize().Y - Header - Footer) / FMath::Max(1, Count));
        const double Y = Menu.Min.Y + Header + Index * Step;
        return FBox2D(FVector2D(Menu.Min.X + 10., Y),
            FVector2D(Menu.Max.X - 10., Y + Step - 3.));
    }
}
