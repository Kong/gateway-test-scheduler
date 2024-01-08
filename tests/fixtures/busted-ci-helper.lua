-- busted-ci-helper.lua

-- Output Busted events to a file for CI integration testing purposes

local busted = require 'busted'
local cjson = require 'cjson'

local busted_event_path = os.getenv("BUSTED_EVENT_FILE_PATH")

-- Function to recursively copy a table, skipping keys associated with functions
local function copyTable(original, copied)
  copied = copied or {}

  for key, value in pairs(original) do
    if type(value) == "table" then
      copied[key] = copyTable(value, {})
    elseif type(value) ~= "function" then
      copied[key] = value
    end
  end

  return copied
end

if busted_event_path then
  local file = io.open(busted_event_path, "a+")

  local events = {{ 'suite', 'reset' },
                  { 'suite', 'start' },
                  { 'suite', 'end' },
                  { 'file', 'start' },
                  { 'file', 'end' },
                  { 'test', 'start' },
                  { 'test', 'end' },
                  { 'pending' },
                  { 'failure', 'it' },
                  { 'error', 'it' },
                  { 'failure' },
                  { 'error' }}

  for _, event in ipairs(events) do
    busted.subscribe(event, function (...)
      local args = {}
      for i, original in ipairs{...} do
        if type(original) == "table" then
          args[i] = copyTable(original)
        elseif type(original) ~= "function" then
          args[i] = original
        end
      end

      file:write(cjson.encode({ event = event[1] .. (event[2] and ":" .. event[2] or ""), args = args }) .. "\n")
      return nil, true --continue
    end)
  end
end