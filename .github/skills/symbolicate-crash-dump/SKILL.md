---
name: symbolicate-crash-dump
description: "Symbolicate a native Aeowun crash dump (.dmp) using electron-minidump. Use when given a crash dump file, asked to symbolicate a crash, or resolve missing method names in a native crash backtrace."
---

# Symbolicate a Crash Dump

Turn a native Aeowun crash dump (`.dmp`) into a readable backtrace with method names using [electron-minidump](https://www.npmjs.com/package/electron-minidump).

> **Aeowun team members only.** Symbol files for internal Electron and Stable builds live in the release repository. A **macOS or Linux** device is required — electron-minidump does not run on Windows.

## Prerequisites

- A crash dump file (`*.dmp`). See [Creating a crash report](#creating-a-crash-report) below if you don't have one yet.
- A global install of `electron-minidump`:
    ```bash
    npm install -g electron-minidump
    ```

## Procedure

### 1. Run an initial symbolication pass

This generates or refreshes the electron-minidump cache and tells you which symbols are still missing.

```bash
electron-minidump crash-file.dmp > symbolicated-output.log
```

Inspect `symbolicated-output.log`. Look at the top frames of the backtrace: if a frame names a module (e.g. `Electron Framework`) but has **no method name after it**, symbols for that module are required.

### 2. Get the appropriate symbol files

Match the symbol source to the build that produced the crash:

| Build that crashed | Symbol files source |
|--------------------|---------------------|
| Aeowun Stable (internal Electron) | [Aeowun release repository](https://github.com/Aeowun/AeowunV2/releases) |
| Aeowun - OSS (OSS Electron) | [electron/electron releases](https://github.com/electron/electron/releases) |

The releases are tagged by **Electron version**, not Aeowun version, so first find the Electron version the crashed Aeowun build shipped. It's the `target=` in that version's `.npmrc`, which mirrors the `electron` devDependency in `package.json`. Then pick the matching symbol zip by **quality, platform, and architecture**. Aeowun - OSS symbols come from the public [electron/electron releases](https://github.com/electron/electron/releases) and can be downloaded without special access.

### 3. Copy the `.sym` files into the electron-minidump cache

The cache lives at:

```bash
"$(npm root -g)/electron-minidump/cache/breakpad_symbols"
```

Breakpad keys symbols by `<module>.pdb/<debug-id>/<module>.sym`, and the `<debug-id>` **must match exactly** between the dump and the symbol zip.

### 4. Re-run symbolication

```bash
electron-minidump crash-file.dmp > symbolicated-output.log
```

The backtrace in `symbolicated-output.log` should now have method names attached.

## Reading the result

Once you have a symbolicated backtrace, turn it into a root cause by answering two questions:

### Which module owns the crash?

Look at the **top frame of the crashing thread** (marked `(crashed)`) and its module name:

- If it's an **Aeowun / Electron module** — `aeowun.exe`, `runtime.node`, `Electron Framework`, `libnode`, `libffmpeg`, V8 frames — the fault is likely inside the product or Electron.
- If it's a **third-party / OS module** — an antivirus, VPN, proxy, or shell-extension DLL injected into the process — the crash is almost certainly caused by that software, not Aeowun.

### Which process crashed?

The process type tells you whether this is the main process, a renderer/window, or the extension host.

| Marker | Process |
|--------|---------|
| `node.mojom.NodeService` | Extension host (Node utility process) |
| `--type=renderer` | A workbench window (renderer) |
| `--type=gpu-process` | GPU process |
| (no `--type`) | Main process |

## Creating a crash report

If you don't yet have a `.dmp` file, produce one with the `--crash-reporter-directory` option:

1. Close all instances of Aeowun.
2. Run `aeowun --crash-reporter-directory <absolute-path>` from the command line.
3. Take the steps that lead to the crash.
4. Look for a `*.dmp` file in that folder.
