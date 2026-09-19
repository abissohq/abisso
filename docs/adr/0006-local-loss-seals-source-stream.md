# Local loss seals a source stream without inventing dispositions

When M1 locally removes an approved queued event through overflow, explicit discard, private transition, or authenticated-record corruption, the collector does not fabricate a server disposition or renumber surviving events. Survivors retain their event IDs, canonical bytes, source IDs, stream IDs, and sequences and may drain through per-event durable acknowledgements. The old stream's contiguous server checkpoint may remain behind the missing range; it does not negate later individual acceptance. The collector seals that stream for new observations and starts a fresh sequence domain, recording only a content-free local gap.

This favors immutable event identity and honest missing-evidence semantics over an apparently continuous checkpoint. Future adapters must treat a checkpoint as a contiguous acknowledgement within one stream, not as a global measure of collection completeness.
