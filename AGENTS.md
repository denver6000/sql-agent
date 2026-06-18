# CodingAgent

## Project Purpose

This repository is a personal agent runtime built on top of `@mariozechner/pi-agent-core`.

The goal is to evolve it into an all-purpose agent that can handle more than coding tasks. The intended direction includes support for capabilities such as:

- GitHub access
- Firestore access
- Google Workspace access
- Other practical tools and integrations that make the agent broadly useful

This project exists for three reasons:

1. To understand how agent systems work in practice
2. To learn how to design an effective runtime and tool layer
3. To serve as a portfolio project that demonstrates that work clearly

## Repository Context

This codebase should be treated as an experimental but intentional runtime project. Changes should support learning, extensibility, and a clearer understanding of agent architecture, not just short-term feature delivery.

When making decisions, prefer:

- Clear runtime structure over clever shortcuts
- Tooling patterns that can scale beyond coding use cases
- Changes that make the agent easier to inspect, debug, and extend
- Solutions that improve understanding of how the system behaves

## `sessions/`

The [`sessions/`](./sessions/) directory contains detailed records from past development sessions.

These sessions may include:

- questions about agent concepts
- feature work
- bug investigation and fixes
- architecture exploration

Their purpose is to preserve the development journey and project history so future AI assistance can:

- trace bugs with more context
- implement features in a way that matches the current architecture
- understand why past decisions were made
- build on prior exploration instead of repeating it

## `references/`

The [`references/`](./references/) directory contains external agent-related material used for learning and integration work.

This includes things such as:

- AI harnesses
- coding harnesses
- other agent projects
- related implementations that may inform this project

These references exist to help compare approaches, borrow strong patterns, and learn from projects that solve similar problems well.

## Guidance For Future Work

If you are modifying this repository, keep the project purpose in view:

- this is not only a working agent runtime, but also a learning artifact
- preserve clarity in architecture and tooling decisions
- favor extensibility toward general-purpose agent capabilities
- use `sessions/` and `references/` as supporting context when they are relevant
