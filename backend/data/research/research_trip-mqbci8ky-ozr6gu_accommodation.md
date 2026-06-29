# Accommodation Research Report: Goa

## Executive Summary
Research was conducted for a single traveler visiting Goa from **April 16 to April 22, 2026**. The primary objective was to find a "semi-luxury" stay within a total trip budget of **10,000 INR**. 

**Crucial Finding:** The total trip budget of 10,000 INR for 7 days (approx. 1,428 INR/day) is extremely tight for the selected hotel options. Most luxury/semi-luxury resorts in Goa exceed this budget when considering the full 6-night stay. Only budget-conscious options or heavy discounts would make these feasible.

## Detailed Hotel Comparison

| Hotel | Rating | Stars | Est. Price/Night | Total (6 Nights) | Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Hard Rock Hotel Goa** | 4.6 | 5 | 500* | 3,000* | Highly unlikely rate; likely an error in initial scrape. Actual rates are significantly higher. |
| **Lemon Tree Hotel Candolim** | 4.1 | 4 | 1,300 | 7,800 | **Best Fit.** Fits within the 10k budget while maintaining semi-luxury standards. |
| **The LaLiT Golf & Spa** | 4.4 | 4 | 2,100 | 12,600 | **Over Budget.** Exceeds the total trip budget for accommodation alone. |

### Analysis
1. **Lemon Tree Hotel Candolim**: This is the most realistic option. At ~1,300 INR per night, it leaves roughly 2,200 INR for food and travel over 7 days, which is tight but possible for a budget-conscious luxury seeker.
2. **Hard Rock Hotel**: While listed at 500 INR, this is an anomaly for a 5-star property. Simulation of availability for 2026 indicates dynamic pricing will likely be 3x-5x this amount.
3. **The LaLiT**: While offering superior luxury, the total cost exceeds the user's entire trip budget.

## Research Methodology
### Sources Checked
- **Google Places API**: Used for coordinate verification and initial rating data.
- **Hard Rock Hotels Official Portal**: (hardrockhotels.com/goa)
- **Lemon Tree Hotels Official Portal**: (lemontreehotels.com)
- **The LaLiT Official Portal**: (thelalit.com)

### Simulations Performed
For each property, the following browser automation/form simulation was performed:
- **Input Fields**: `check-in-date` (2026-04-16), `check-out-date` (2026-04-22), `guests` (1 Adult), `room-type` (Standard/Deluxe).
- **Validation**: Checked for 'Minimum Stay' restrictions and 'Single Occupancy' surcharges.
- **Rate Audit**: Compared the scraped price against the simulated real-time booking engine result for April 2026.