# Widget State Machine

```mermaid
stateDiagram-v2
  [*] --> Welcome
  Welcome --> Apartment: شقة تشطيب
  Welcome --> Building: عمارة / مبنى جديد
  Welcome --> PriceLookup: سعر خامة أو بند
  Apartment --> CollectFacts
  Building --> CollectFacts
  CollectFacts --> CollectFacts: record fact / ask next missing
  CollectFacts --> EstimateLoading: calculate / compare intent
  EstimateLoading --> EstimateReady: valid API response
  EstimateLoading --> OfflineFallback: server/network failure
  EstimateReady --> Details: explain / open full BOQ / gaps
  EstimateReady --> Compare: compare packages
  EstimateReady --> LeadConsent: send to engineer
  LeadConsent --> WhatsApp: persisted lead
  LeadConsent --> WhatsApp: API save fails, fallback summary
  PriceLookup --> PriceLookup: result / clarify query
  OfflineFallback --> CollectFacts: retry or continue locally
```

Implementation state includes selected service, structured project facts, pending fact, question count, last sanitized estimate, estimate ID and price-book version. It saves structured facts only (no name/phone). The estimate is not cached as a contract-ready document; the stored snapshot should be recalculated after price book changes.

Note: scenario preview is separate and should not overwrite the current project until the visitor accepts the change. The architecture supports that rule, but end-to-end persistence of all branches remains part of alpha validation.
