#!/usr/bin/env bash

BROWSER_TEST_SESSIONS=()

agent-browser() {
  local index
  for ((index = 1; index <= $#; index += 1)); do
    if [[ "${!index}" == "--session" ]]; then
      local value_index=$((index + 1))
      local candidate="${!value_index}"
      local known=false existing
      for existing in "${BROWSER_TEST_SESSIONS[@]}"; do [[ "$existing" == "$candidate" ]] && known=true; done
      [[ "$known" == true ]] || BROWSER_TEST_SESSIONS+=("$candidate")
      break
    fi
  done
  command agent-browser "$@"
}

browser_test_cleanup() {
  local status=$?
  trap - EXIT INT TERM
  local session close_pid
  local -a close_pids=()
  for session in "${BROWSER_TEST_SESSIONS[@]}"; do
    command agent-browser --session "$session" close >/dev/null 2>&1 &
    close_pids+=("$!")
  done
  for close_pid in "${close_pids[@]}"; do wait "$close_pid" || true; done
  local server_pid
  for server_pid in "${PID:-}" "${SERVER_PID:-}"; do
    [[ -z "$server_pid" ]] || kill "$server_pid" >/dev/null 2>&1 || true
  done
  [[ -z "${LOG:-}" ]] || rm -f "$LOG"
  [[ -z "${SERVER_LOG:-}" ]] || rm -f "$SERVER_LOG"
  exit "$status"
}

browser_test_install_cleanup() {
  trap browser_test_cleanup EXIT INT TERM
}
