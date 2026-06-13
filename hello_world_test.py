from hello_world import greet


def test_greet_default() -> None:
    assert greet() == "Hello, World!"


def test_greet_custom_name() -> None:
    assert greet("Alice") == "Hello, Alice!"
    assert greet("前端助手") == "Hello, 前端助手!"
