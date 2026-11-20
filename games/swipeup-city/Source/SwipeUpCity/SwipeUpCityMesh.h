#pragma once

#include "CoreMinimal.h"

class AActor;
class USceneComponent;
class UProceduralMeshComponent;

namespace SwipeUpCityMesh
{
    UProceduralMeshComponent* Add(AActor& Owner, USceneComponent& Parent,
                                  const TCHAR* AssetName, const FVector& Offset = FVector::ZeroVector);
}
