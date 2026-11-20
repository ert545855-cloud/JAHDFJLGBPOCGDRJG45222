#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SwipeUpCityBlockout.generated.h"

class UInstancedStaticMeshComponent;

// Mobile-first coastal city source map. Repeated pieces are hardware-instanced.
// Fab art can replace the underlying placeholder meshes without changing layout data.
UCLASS()
class SWIPEUPCITY_API ASwipeUpCityBlockout : public AActor
{
    GENERATED_BODY()
public:
    ASwipeUpCityBlockout();
    virtual void BeginPlay() override;

private:
    enum ELayer : int32
    {
        Terrain, Road, Sidewalk, Beach, Sea, Lawn, Line, Concrete, Cream,
        Terracotta, BlueWall, Glass, Roof, Iron, Timber, Trunk, Leaf,
        PinkAccent, GoldAccent, Deck, LayerCount
    };

    UPROPERTY(VisibleAnywhere, Category="SwipeUp City")
    TArray<TObjectPtr<UInstancedStaticMeshComponent>> MeshLayers;

    UPROPERTY(VisibleAnywhere, Category="SwipeUp City")
    TObjectPtr<UInstancedStaticMeshComponent> PalmCanopies;

    UPROPERTY()
    TMap<FName, TObjectPtr<UInstancedStaticMeshComponent>> ImportedProps;

    void LoadImportedProps();
    bool AddImportedProp(FName Name, const FVector& Origin, const FVector& Size, float Yaw = 0.f);
    void ParkingLot(float X, float Y);
    void Box(int32 Layer, const FVector& Position, const FVector& Size, float Yaw = 0.f);
    void Palm(float X, float Y, float Scale = 1.f);
    void StreetLamp(float X, float Y, float Angle = 0.f);
    void Bench(float X, float Y, float Angle = 0.f);
    void CafeTable(float X, float Y, bool Umbrella);
    void Building(float X, float Y, int32 Floors, float Width, float Depth,
                  int32 Style, FRandomStream& Random);
    void ParkSquare(float X, float Y, FRandomStream& Random);
    void CityBlock(int32 Col, int32 Row, FRandomStream& Random);
    void BuildCity();
    void AddSunlight();
};
