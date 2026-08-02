import axios from 'axios';
import { getApiBase } from '@/services/apiBase';

const API_BASE_URL = getApiBase();

export interface TravelQuery {
  query: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  budget?: number;
  guests?: number;
}

export interface Flight {
  airline: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  stops: number;
  carbonEmissions: string;
  bookingUrl: string;
}

export interface Hotel {
  name: string;
  rating: number;
  reviewCount: number;
  price: number;
  image: string;
  amenities: string[];
  location: string;
  link: string;
  type: string;
}

export interface Activity {
  title: string;
  description: string;
  link: string;
}

export interface DayItinerary {
  day: number;
  title: string;
  activities: string[];
  meals: string[];
}

export interface TravelPlan {
  destination: string;
  origin: string;
  dates: {
    departure: string;
    return: string;
  };
  flights: Flight[];
  hotels: Hotel[];
  activities: Activity[];
  plan: {
    summary: string;
    bestFlightIndex: number;
    bestHotelIndex: number;
    recommendedActivities: number[];
    dayByDayItinerary?: DayItinerary[];
    budgetBreakdown?: {
      flights: number;
      accommodation: number;
      activities: number;
      food: number;
      total: number;
    };
    travelTips?: string[];
    packingList?: string[];
    localInfo?: {
      currency: string;
      language: string;
      timezone: string;
      weather: string;
    };
  };
}

export async function planTravel(travelQuery: TravelQuery): Promise<TravelPlan> {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/travel/plan`, travelQuery, {
      timeout: 45000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      return response.data.travelPlan;
    } else {
      throw new Error(response.data.message || 'Travel planning failed');
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to plan travel');
    }
    throw error;
  }
}
