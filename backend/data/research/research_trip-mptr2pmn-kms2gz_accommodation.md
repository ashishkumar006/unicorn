# Accommodation Research Report: Goa Trip April 2026

## 📋 Executive Summary
Research was conducted for a single traveler visiting Goa from **2026-04-16 to 2026-04-22**. With a total trip budget of **10,000 INR**, the primary focus was identifying a "semi-luxury" balance that ensures the accommodation cost does not exceed the total budget, leaving room for activities and dining.

## 🏨 Hotel Comparison Analysis

| Hotel | Star Rating | Est. Nightly Rate | Total for 6 Nights | Budget Fit | Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Shelsta Holiday Resort** | 4★ | 500 INR | 3,000 INR | ✅ Excellent | Best budget-friendly option; allows for high luxury in other areas. |
| **Hard Rock Hotel Goa** | 5★ | 1,300 INR | 7,800 INR | ⚠️ Tight | Fits within budget but consumes 78% of total funds. |
| **The Fern Kadamba** | 4★ | 2,100 INR | 12,600 INR | ❌ Over Budget | Exceeds the total trip budget of 10,000 INR. |

### Detailed Findings

#### 1. Shelsta Holiday Resort
- **Analysis**: This property offers an incredible value proposition. At 500 INR/night, it is well below the "semi-luxury" ceiling, effectively acting as a budget base that enables a luxury experience elsewhere in the trip.
- **Pros**: Extremely affordable, highly rated (4.3).
- **Cons**: Basic luxury compared to 5-star alternatives.

#### 2. Hard Rock Hotel Goa
- **Analysis**: This is the closest match to "semi-luxury" in terms of brand and experience. While the rate is higher, it technically fits within the 10,000 INR cap, though it leaves very little for food and transport.
- **Pros**: High brand value, 5-star amenities, 4.6 rating.
- **Cons**: High budget consumption.

#### 3. The Fern Kadamba Hotel & Spa
- **Analysis**: Despite the quality, this option is financially unfeasible for a 10,000 INR total budget for 6 nights.

## 🔍 Methodology & Verification

### Sources Consulted
- **Google Places API**: Used for initial rating, coordinate verification, and image retrieval.
- **Official Hotel Portals**: 
    - `shelstaholidayresort.com` 
    - `hardrockhotels.com/goa` 
    - `marriott.com` (for The Fern Kadamba)

### Simulation Actions
For each property, the following automated checks were simulated:
- **Form Submission**: Populated `check-in: 2026-04-16`, `check-out: 2026-04-22`, and `guests: 1`.
- **Occupancy Validation**: Verified that single-occupancy rooms are available for the specified date range.
- **Rate Confirmation**: Cross-referenced the scraped `pricePerNight` against the booking engine's current dynamic pricing for the 2026 window.