# Abisso Domain

Abisso models live engineering work across people and AI coding agents while preserving the difference between accepted evidence and conclusions drawn from it.

## Language

**Evidence freshness**:
Whether Abisso has recently accepted qualifying evidence for an entity. Fresh evidence does not prove current agent execution, meaningful progress, productivity, or a successful outcome.
_Avoid_: Activity, progress, liveness

**Meaningful progress**:
Evidence that intended engineering work advanced toward an outcome. A heartbeat, recent contact, or increased activity count is not meaningful progress by itself.
_Avoid_: Freshness, activity volume, productivity

**Collector enrollment**:
The user-authorized association of a collector installation with one Abisso machine, person, and workspace. Browser sign-in establishes the person's identity; Abisso grants the machine its own limited authority.
_Avoid_: Machine login

**Shared outbound queue**:
The collector's local holding area for approved canonical records that may be sent to the workspace. Private-session records never enter it.
_Avoid_: Local activity history

**Collection gap**:
An interval or loss of evidence during which Abisso cannot make a claim about the work that occurred. It is not evidence of inactivity, failure, or lack of progress.
_Avoid_: Inactive period, failed session

**Effective collection policy**:
The collection limits that apply to one collector after combining workspace policy with that person's local consent and privacy controls. A workspace policy can narrow those limits but cannot bypass local controls.
_Avoid_: Server permission to collect

**Terminal machine authorization loss**:
A confirmed end to one machine's authority to upload, such as revocation, expired refresh authority, or removal from its workspace. Records held under that machine cannot be transferred to a new enrollment.
_Avoid_: Temporary access-token expiry
