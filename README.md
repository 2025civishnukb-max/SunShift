# ReliefReady 🚨
### Intelligent Disaster Relief Resource Allocation & Decision Support System

**ReliefReady** is a browser-based disaster management decision-support prototype designed to help emergency response teams allocate limited essential supplies to affected villages based on urgency, population, vulnerability, resource availability and road accessibility.

During disasters such as floods, cyclones and landslides, emergency response teams must make critical decisions with limited resources and incomplete information. ReliefReady aims to make these decisions more systematic, transparent and explainable.

Instead of simply distributing supplies, ReliefReady helps identify **where resources are needed most, how they can be allocated, and which communities remain underserved.**

---

## 🎯 Problem Statement

Disasters can affect multiple villages simultaneously, creating an urgent demand for food, drinking water and other essential supplies.

However, emergency response teams often face several constraints:

- Limited availability of relief supplies.
- Limited vehicle carrying capacity.
- Roads blocked by floods, landslides or damaged infrastructure.
- Different levels of urgency across affected villages.
- Vulnerable populations requiring priority attention.
- The need to justify and communicate allocation decisions.

ReliefReady addresses these challenges through priority-based resource allocation, constraint-aware planning and scenario simulation.

---

## 💡 Key Features

### 1. Disaster Situation Dashboard
- Overview of affected villages and available resources.
- Interactive map showing village locations and delivery status.
- Summary of resource availability and allocation outcomes.
- Priority ranking of affected villages.

### 2. Priority Scoring and Ranking

Villages are ranked using a weighted priority scoring system based on:

- Urgency: 40%
- Population: 30%
- Vulnerable population: 30%

The population-related values are normalized against the largest village in the scenario.

This helps emergency response teams identify villages that require attention first.

### 3. Intelligent Resource Allocation

ReliefReady provides two allocation strategies:

**Greedy Allocation**
- Processes villages according to their priority ranking.
- Allocates available resources while respecting village demand.
- Considers available food and water stocks.
- Enforces truck carrying capacity.
- Excludes villages with inaccessible roads.

**Optimized Allocation**
- Uses an independent allocation computation to evaluate resource distribution.
- Aims to reduce weighted unmet demand.
- Respects resource availability, village demand, truck capacity and accessibility constraints.
- Provides comparison metrics against the Greedy strategy.

The application allows users to compare the outcomes of both strategies and understand their trade-offs.

### 4. Explainable Allocation Decisions

ReliefReady aims to make allocation decisions transparent by showing:

- Village priority scores and their breakdown.
- Allocated food and water quantities.
- Remaining shortages.
- Reasons for unmet demand.
- Resource and transportation constraints affecting allocation.

This helps users understand not only what was allocated, but also why.

### 5. Interactive What-if Scenario Simulator

Users can modify disaster conditions and observe how allocation decisions change.

Supported scenarios include:

- **Blocked Road:** Simulates a village becoming inaccessible.
- **New Village:** Introduces an additional affected village.
- **Reduced Stock:** Simulates a reduction in available food and water.
- **Flood Scenario:** Simulates changes in disaster impact.

The simulator supports scenario comparisons to help users understand how changing conditions affect relief operations.

### 6. Strategic Intervention Simulator

Users can explore possible interventions, including:

- Increasing food supplies.
- Increasing water supplies.
- Adding truck capacity.
- Restoring blocked road access.
- Combining multiple interventions.

The system recalculates allocation outcomes to help evaluate which interventions could improve relief distribution.

### 7. Humanitarian Impact Analysis

ReliefReady considers the impact of resource allocation on affected communities.

The application includes indicators intended to evaluate:

- Population served.
- Vulnerable population coverage.
- Unmet critical demand.
- Resource fulfillment.
- Differences in allocation outcomes between villages.

These indicators support more informed and equitable disaster response decisions.

### 8. Route and Accessibility Management

The application considers road accessibility when determining whether a village can receive supplies.

It also provides delivery feasibility information and a suggested delivery sequence based on priority and distance.

The current delivery sequence is a heuristic, not a guarantee of an optimal multi-stop route.

### 9. Reports and Data Export

- Allocation summaries.
- Resource distribution information.
- Unmet demand reports.
- CSV export for further analysis.

---

## ⚙️ System Architecture

ReliefReady currently uses a self-contained, client-side architecture.

```text
              USER
                |
                v
       HTML + CSS Interface
                |
                v
        JavaScript Application
                |
       +--------+---------+
       |                  |
       v                  v
 Priority Scoring    Scenario Manager
       |                  |
       v                  v
 Village Ranking    Modified Conditions
       |                  |
       +--------+---------+
                |
                v
       Allocation Engine
                |
       +--------+---------+
       |                  |
       v                  v
  Greedy Strategy   Optimized Strategy
       |                  |
       +--------+---------+
                |
                v
       Results & Analysis
                |
       +--------+---------+
       |                  |
       v                  v
 Interactive Map     Reports & CSV
```

### Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | Styling and responsive interface |
| JavaScript | Application logic and algorithms |
| SVG | Interactive map visualization |
| Browser APIs | Client-side interactions and CSV export |

**Architecture note:** ReliefReady currently runs entirely in the browser. It does not require a separate backend server or database.

---

## 🧮 Allocation Constraints

The allocation engine considers the following constraints:

1. **Resource Availability:** Total allocated food and water must not exceed available stock.
2. **Demand Limitation:** A village cannot receive more resources than it requests.
3. **Vehicle Capacity:** Total delivery weight must not exceed the available truck capacity.
4. **Road Accessibility:** Villages with blocked access cannot receive deliveries.
5. **Non-negative Allocation:** Allocated quantities cannot be negative.

### Resource Weight Assumptions

For truck capacity calculations, the prototype uses:

| Resource | Assumed Weight |
|---|---:|
| One food packet | 0.5 kg |
| One litre of water | 1 kg |

These are simplified assumptions for the prototype and can be modified to represent more realistic logistics data.

---

## 🛠️ Getting Started

ReliefReady does not require Python, Node.js, a database or backend configuration.

### Prerequisites

- A modern web browser.
- Git (optional, for cloning the repository).

### Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/ReliefReady.git
```

Navigate into the project directory:

```bash
cd ReliefReady
```

Open `index.html` directly in your browser.

Alternatively, use the VS Code Live Server extension to run the application locally.

---

## 📊 Example Disaster Scenario

The prototype includes a sample scenario involving five villages with limited food and water supplies.

The application evaluates:

- Village urgency and population.
- Vulnerable population.
- Available food and water.
- Truck carrying capacity.
- Road accessibility.

It then generates allocation plans and identifies villages with unmet requirements.

The sample data is illustrative and is not intended to represent verified real-world disaster information.

---

## 🔮 Future Scope

ReliefReady can be extended into a more comprehensive disaster response platform.

Potential improvements include:

- **Backend Integration:** Introduce Python FastAPI for centralized processing and API-based communication.
- **Database Integration:** Store disaster reports, village information, resource inventories and allocation history.
- **Real-time Data Integration:** Incorporate verified weather, flood and disaster information from external data sources.
- **Advanced Optimization:** Explore mathematical optimization techniques for multi-resource allocation.
- **Route Optimization:** Integrate road-network data and routing algorithms such as Dijkstra's algorithm or A*.
- **Geospatial Integration:** Use mapping services and GIS data to represent affected regions and road networks.
- **Multi-user Collaboration:** Allow emergency response teams to access and update a shared operational dashboard.
- **Expanded Resource Planning:** Support medicines, rescue equipment, temporary shelters and other emergency supplies.

---

## ⚠️ Limitations

- The current prototype uses illustrative disaster scenario data.
- It does not currently receive live disaster information from external sources.
- Allocation and scenario calculations run locally in the browser.
- The truck model uses simplified pooled carrying capacity rather than detailed vehicle routing, delivery schedules or multiple trips.
- The suggested delivery sequence is heuristic and should not be interpreted as a globally optimal route.
- Vulnerable population and humanitarian impact figures are estimates derived from the scenario inputs.

ReliefReady is a decision-support prototype, not a replacement for emergency response authorities or field-level verification.

---

## 🌍 Project Vision

Disaster response is not only about how much relief material is available. It is also about ensuring that limited resources reach the communities that need them most.

**ReliefReady aims to transform resource allocation from a reactive process into a transparent, priority-driven and explainable decision-making process.**

*Because in disaster response, every resource and every decision matters.*

---

## 👥 Team

**Project:** ReliefReady  
**Domain:** Disaster Management and Resilience  
**Category:** Software

Developed as a hackathon project.

---
