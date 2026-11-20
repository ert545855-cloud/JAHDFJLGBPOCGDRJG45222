#include "SwipeUpCityMesh.h"
#include "GameFramework/Actor.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/MemoryReader.h"

namespace
{
    const TCHAR* Materials[] = {TEXT("Matte"), TEXT("Glass"), TEXT("Lamp"),
        TEXT("Fabric"), TEXT("Water"), TEXT("Sky"), TEXT("Paint")};

    struct FHarborSection
    {
        uint32 Material = 0;
        TArray<FVector> Positions;
        TArray<FVector> Normals;
        TArray<FLinearColor> Colors;
        TArray<int32> Indices;
    };

    bool ReadMesh(const TCHAR* AssetName, TArray<FHarborSection>& Sections)
    {
        const FString File = FPaths::ProjectContentDir() / TEXT("SwipeUpCity/Meshes")
            / (FString(AssetName) + TEXT(".scmesh"));
        TArray<uint8> Bytes;
        if (!FFileHelper::LoadFileToArray(Bytes, *File) || Bytes.Num() < 8 ||
            FMemory::Memcmp(Bytes.GetData(), "SCM1", 4) != 0)
            return false;

        FMemoryReader Reader(Bytes);
        Reader.Seek(4);
        uint32 Count = 0;
        Reader << Count;
        if (Count == 0 || Count > UE_ARRAY_COUNT(Materials)) return false;

        for (uint32 Section = 0; Section < Count; ++Section)
        {
            if (Reader.TotalSize() - Reader.Tell() < 12) return false;

            FHarborSection& Data = Sections.AddDefaulted_GetRef();
            uint32 Vertices = 0;
            uint32 Indices = 0;
            Reader << Data.Material << Vertices << Indices;
            const int64 Required = static_cast<int64>(Vertices) * 28 + static_cast<int64>(Indices) * 4;
            if (Data.Material >= UE_ARRAY_COUNT(Materials) || Vertices == 0 ||
                Vertices > 250000 || Indices == 0 || Indices % 3 != 0 ||
                Required > Reader.TotalSize() - Reader.Tell())
                return false;

            Data.Positions.Reserve(Vertices);
            Data.Normals.Reserve(Vertices);
            Data.Colors.Reserve(Vertices);
            for (uint32 I = 0; I < Vertices; ++I)
            {
                float X, Y, Z, NX, NY, NZ;
                uint8 R, G, B, A;
                Reader << X << Y << Z << NX << NY << NZ << R << G << B << A;
                const FVector Position(X, Y, Z);
                const FVector Normal(NX, NY, NZ);
                if (Position.ContainsNaN() || Normal.ContainsNaN()) return false;
                Data.Positions.Add(Position);
                Data.Normals.Add(Normal);
                Data.Colors.Add(FLinearColor::FromSRGBColor(FColor(R, G, B, A)));
            }

            Data.Indices.Reserve(Indices);
            for (uint32 I = 0; I < Indices; ++I)
            {
                uint32 Index;
                Reader << Index;
                if (Index >= Vertices) return false;
                Data.Indices.Add(static_cast<int32>(Index));
            }
        }
        return !Reader.IsError() && Reader.Tell() == Reader.TotalSize();
    }
}

UProceduralMeshComponent* SwipeUpCityMesh::Add(AActor& Owner, USceneComponent& Parent,
    const TCHAR* AssetName, const FVector& Offset)
{
    TArray<FHarborSection> Sections;
    if (!ReadMesh(AssetName, Sections))
    {
        UE_LOG(LogTemp, Warning, TEXT("SwipeUp City: missing or malformed mesh %s"), AssetName);
        return nullptr;
    }

    UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(&Owner);
    Mesh->SetupAttachment(&Parent);
    Mesh->SetRelativeLocation(Offset);
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Mesh->SetCanEverAffectNavigation(false);
    Mesh->SetCastShadow(FCString::Strcmp(AssetName, TEXT("Harbor_Sky")) != 0 &&
                        FCString::Strcmp(AssetName, TEXT("Harbor_Sea")) != 0);
    Owner.AddInstanceComponent(Mesh);
    Mesh->RegisterComponent();

    const TArray<FVector2D> UVs;
    const TArray<FProcMeshTangent> Tangents;
    for (int32 Index = 0; Index < Sections.Num(); ++Index)
    {
        const FHarborSection& Section = Sections[Index];
        Mesh->CreateMeshSection_LinearColor(Index, Section.Positions, Section.Indices,
            Section.Normals, UVs, Section.Colors, Tangents, false, false);

        const FString Name = FString::Printf(TEXT("M_Harbor%s"), Materials[Section.Material]);
        const FString Path = FString::Printf(TEXT("/Game/SwipeUpCity/HarborMaterials/%s.%s"), *Name, *Name);
        if (UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, *Path))
            Mesh->SetMaterial(Index, Material);
    }

    return Mesh;
}
