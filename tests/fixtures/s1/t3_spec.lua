describe("test", function()
  it("passes_2", function()
    assert.are.equal(1, 1)
  end)
  it("fails_2", function()
    assert.are.equal(1, 2)
  end)
  it("passes_3", function()
    assert.are.equal(1, 1)
  end)
end)

