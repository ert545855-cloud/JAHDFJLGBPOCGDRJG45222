#include "SwipeUpCityCharacter.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "UObject/ConstructorHelpers.h"

ASwipeUpCityCharacter::ASwipeUpCityCharacter()
{
    PrimaryActorTick.bCanEverTick = false;
    GetCapsuleComponent()->InitCapsuleSize(34.f, 88.f);
    bUseControllerRotationPitch = false;
    bUseControllerRotationYaw = false;
    bUseControllerRotationRoll = false;

    GetCharacterMovement()->bOrientRotationToMovement = true;
    GetCharacterMovement()->RotationRate = FRotator(0.f, 540.f, 0.f);
    GetCharacterMovement()->MaxWalkSpeed = 420.f;
    GetCharacterMovement()->JumpZVelocity = 450.f;
    GetCharacterMovement()->AirControl = 0.35f;

    CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
    CameraBoom->SetupAttachment(GetRootComponent());
    CameraBoom->TargetArmLength = 330.f;
    CameraBoom->SetRelativeLocation(FVector(0.f, 0.f, 65.f));
    CameraBoom->bUsePawnControlRotation = true;

    FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
    FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
    FollowCamera->bUsePawnControlRotation = false;

    PlaceholderBody = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("PrototypeBody"));
    PlaceholderBody->SetupAttachment(GetCapsuleComponent());
    PlaceholderBody->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    PlaceholderBody->SetRelativeScale3D(FVector(0.48f, 0.48f, 1.6f));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if (Cylinder.Succeeded()) PlaceholderBody->SetStaticMesh(Cylinder.Object);
}

void ASwipeUpCityCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);
    check(PlayerInputComponent);
    PlayerInputComponent->BindAxis("MoveForward", this, &ASwipeUpCityCharacter::MoveForward);
    PlayerInputComponent->BindAxis("MoveRight", this, &ASwipeUpCityCharacter::MoveRight);
    PlayerInputComponent->BindAxis("Turn", this, &ASwipeUpCityCharacter::Turn);
    PlayerInputComponent->BindAxis("LookUp", this, &ASwipeUpCityCharacter::LookUp);
    PlayerInputComponent->BindAction("Jump", IE_Pressed, this, &ACharacter::Jump);
    PlayerInputComponent->BindAction("Jump", IE_Released, this, &ACharacter::StopJumping);
    PlayerInputComponent->BindAction("Sprint", IE_Pressed, this, &ASwipeUpCityCharacter::StartSprint);
    PlayerInputComponent->BindAction("Sprint", IE_Released, this, &ASwipeUpCityCharacter::StopSprint);
}

void ASwipeUpCityCharacter::MoveForward(float Value)
{
    if (!Controller || FMath::IsNearlyZero(Value)) return;
    const FRotator Yaw(0.f, Controller->GetControlRotation().Yaw, 0.f);
    AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), Value);
}
void ASwipeUpCityCharacter::MoveRight(float Value)
{
    if (!Controller || FMath::IsNearlyZero(Value)) return;
    const FRotator Yaw(0.f, Controller->GetControlRotation().Yaw, 0.f);
    AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), Value);
}
void ASwipeUpCityCharacter::Turn(float Value) { AddControllerYawInput(Value); }
void ASwipeUpCityCharacter::LookUp(float Value) { AddControllerPitchInput(Value); }
void ASwipeUpCityCharacter::SetSprinting(bool bEnable)
{
    bSprinting = bEnable;
    GetCharacterMovement()->MaxWalkSpeed = bSprinting ? 650.f : 420.f;
}
void ASwipeUpCityCharacter::StartSprint() { SetSprinting(true); }
void ASwipeUpCityCharacter::StopSprint() { SetSprinting(false); }
void ASwipeUpCityCharacter::ToggleSprint() { SetSprinting(!bSprinting); }
