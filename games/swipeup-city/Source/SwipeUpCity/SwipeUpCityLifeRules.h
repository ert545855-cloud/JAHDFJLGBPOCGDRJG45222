#pragma once

#include <algorithm>
#include <array>

namespace SwipeUpCityLife
{
    enum class Place : int { None, Cafe, Courier, Taxi, Park, Marina, Stage, Training, Garage, Overlook, Count };
    enum class Job : int { None, Barista, Courier, Taxi, Photographer, Count };
    enum class Result { Ok, TooPoor, Locked, Busy, Full, Empty, Closed, WrongPlace, NeedCar, NeedFoot };

    struct Vehicle
    {
        int Price;
        float TopSpeed;
        float Acceleration;
        float TurnRate;
        float HalfLength;
        float HalfWidth;
        float Axle;
        float WheelSide;
        float WheelRadius;
        float BodyHeight;
    };

    inline constexpr std::array<Vehicle, 6> Vehicles = {{
        {0,    1740.f,  850.f, 101.f, 212.f, 96.f, 113.f, 90.f, 34.f, 68.f},
        {0,    1420.f,  680.f,  79.f, 252.f, 99.f, 143.f, 94.f, 34.f, 68.f},
        {850,  2490.f, 1160.f, 107.f, 226.f, 99.f, 139.f, 93.f, 32.f, 59.f},
        {1150, 1870.f,  800.f,  77.f, 234.f, 104.f, 136.f, 98.f, 40.f, 76.f},
        {1350, 2040.f,  770.f,  81.f, 255.f, 103.f, 156.f, 97.f, 37.f, 72.f},
        {1700, 2750.f, 1280.f, 113.f, 236.f, 101.f, 143.f, 95.f, 33.f, 61.f},
    }};

    struct Step { Place Site; bool bInCar; };
    struct Shift
    {
        Place Employer;
        std::array<Step, 3> Steps;
        int Length;
        int Pay;
    };

    inline constexpr std::array<Shift, 4> Shifts = {{
        { Place::Cafe,    {{{Place::Cafe, false}, {Place::Stage, false}, {Place::None, false}}}, 2, 165 },
        { Place::Courier, {{{Place::Courier, false}, {Place::Marina, false}, {Place::None, false}}}, 2, 190 },
        { Place::Taxi,    {{{Place::Taxi, true}, {Place::Park, true}, {Place::Courier, true}}}, 3, 265 },
        { Place::Overlook,{{{Place::Marina, false}, {Place::Park, false}, {Place::Overlook, false}}}, 3, 230 },
    }};

    inline const Shift& GetShift(Job Type)
    {
        return Shifts[static_cast<int>(Type) - 1];
    }

    struct Profile
    {
        int Cash = 280;
        int CafeLevel = 0;
        int Supplies = 0;
        int CarKeys = 3;
        int Community = 0;
        int ShiftCount = 0;
        int CafeOrders = 0;
        Job Active = Job::None;
        int Stage = 0;
        bool bCafeOpen = false;

        static constexpr int TilePrice = 850;
        static constexpr int StockPrice = 75;
        static constexpr int Limit = 100000000;
        using Fields = std::array<int, 11>;

        Fields Write() const
        {
            return {1, Cash, CafeLevel, Supplies, CarKeys, Community, ShiftCount, CafeOrders,
                    static_cast<int>(Active), Stage, bCafeOpen ? 1 : 0};
        }

        static bool Read(const Fields& Values, Profile& Out)
        {
            if (Values[0] != 1)
                return false;
            Profile Parsed;
            Parsed.Cash = std::clamp(Values[1], 0, Limit);
            Parsed.CafeLevel = std::clamp(Values[2], 0, 3);
            Parsed.Supplies = std::clamp(Values[3], 0, Parsed.Capacity());
            Parsed.CarKeys = (std::max(0, Values[4]) & ((1 << Vehicles.size()) - 1)) | 3;
            Parsed.Community = std::clamp(Values[5], 0, Limit);
            Parsed.ShiftCount = std::clamp(Values[6], 0, Limit);
            Parsed.CafeOrders = std::clamp(Values[7], 0, Limit);
            if (Values[8] > 0 && Values[8] < static_cast<int>(Job::Count))
            {
                Parsed.Active = static_cast<Job>(Values[8]);
                Parsed.Stage = std::clamp(Values[9], 0, GetShift(Parsed.Active).Length - 1);
            }
            Parsed.bCafeOpen = Values[10] == 1 && Parsed.CafeLevel > 0 && Parsed.Supplies > 0;
            Out = Parsed;
            return true;
        }

        int Capacity() const { return CafeLevel > 0 ? 6 + CafeLevel * 6 : 0; }
        int CupPrice() const { return 40 + CafeLevel * 16; }
        int UpgradePrice() const { return CafeLevel == 1 ? 460 : 820; }

        bool OwnsCar(int Index) const
        {
            return Index >= 0 && Index < static_cast<int>(Vehicles.size()) && (CarKeys & (1 << Index));
        }

        Result BuyCar(int Index)
        {
            if (Index < 0 || Index >= static_cast<int>(Vehicles.size())) return Result::Locked;
            if (OwnsCar(Index)) return Result::Full;
            if (!Spend(Vehicles[Index].Price)) return Result::TooPoor;
            CarKeys |= 1 << Index;
            return Result::Ok;
        }

        Result BuyCafe()
        {
            if (CafeLevel) return Result::Full;
            if (!Spend(TilePrice)) return Result::TooPoor;
            CafeLevel = 1;
            Supplies = 4;
            return Result::Ok;
        }

        Result UpgradeCafe()
        {
            if (!CafeLevel) return Result::Locked;
            if (CafeLevel == 3) return Result::Full;
            if (!Spend(UpgradePrice())) return Result::TooPoor;
            ++CafeLevel;
            return Result::Ok;
        }

        Result Refill()
        {
            if (!CafeLevel) return Result::Locked;
            if (Supplies == Capacity()) return Result::Full;
            const int Added = std::min(5, Capacity() - Supplies);
            if (!Spend(StockPrice / 5 * Added)) return Result::TooPoor;
            Supplies += Added;
            return Result::Ok;
        }

        Result ToggleCafe()
        {
            if (!CafeLevel) return Result::Locked;
            if (!bCafeOpen && Supplies == 0) return Result::Empty;
            bCafeOpen = !bCafeOpen;
            return Result::Ok;
        }

        Result Serve()
        {
            if (!bCafeOpen) return Result::Closed;
            if (Supplies <= 0) return Result::Empty;
            --Supplies;
            AddCash(CupPrice());
            CafeOrders = std::min(CafeOrders + 1, Limit);
            if (Supplies == 0) bCafeOpen = false;
            return Result::Ok;
        }

        Result TakeShift(Job Choice, Place At)
        {
            if (Active != Job::None) return Result::Busy;
            if (Choice <= Job::None || Choice >= Job::Count || GetShift(Choice).Employer != At)
                return Result::WrongPlace;
            Active = Choice;
            Stage = 0;
            return Result::Ok;
        }

        void QuitShift()
        {
            Active = Job::None;
            Stage = 0;
        }

        Result Work(Place At, bool bInCar, int& Paid)
        {
            Paid = 0;
            if (Active == Job::None) return Result::Locked;
            const Shift& Assignment = GetShift(Active);
            const Step Target = Assignment.Steps[Stage];
            if (At != Target.Site) return Result::WrongPlace;
            if (Target.bInCar != bInCar) return Target.bInCar ? Result::NeedCar : Result::NeedFoot;
            if (++Stage == Assignment.Length)
            {
                Paid = Assignment.Pay;
                AddCash(Paid);
                ShiftCount = std::min(ShiftCount + 1, Limit);
                QuitShift();
            }
            return Result::Ok;
        }

        void CompleteActivity(int Reward)
        {
            AddCash(Reward);
            Community = std::min(Community + 1, Limit);
        }

    private:
        bool Spend(int Price)
        {
            if (Cash < Price) return false;
            Cash -= Price;
            return true;
        }

        void AddCash(int Amount)
        {
            Cash = std::min(Cash + std::max(Amount, 0), Limit);
        }
    };
}
