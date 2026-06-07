// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/InvoiceLogger.sol";

contract InvoiceLoggerTest is Test {
    InvoiceLogger public logger;
    address public issuer       = address(0x1);
    address public clientWallet = address(0x2);
    address public other        = address(0x3);

    uint256 constant FUTURE_DUE = 1800000000;
    uint256 constant PAST_DUE   = 1000000000;

    function setUp() public {
        logger = new InvoiceLogger();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _log(string memory id, address caller, uint256 due, address client) internal {
        vm.prank(caller);
        logger.logInvoice(id, keccak256(abi.encodePacked(id)), 80000, due, "Acme Corp", client);
    }

    function _logNoClient(string memory id, address caller, uint256 due) internal {
        _log(id, caller, due, address(0));
    }

    function _hash(string memory id) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(id));
    }

    // ─── logInvoice ───────────────────────────────────────────────────────────

    function test_LogInvoice() public {
        vm.prank(issuer);
        bytes32 h = _hash("INV-001");
        logger.logInvoice("INV-001", h, 80000, FUTURE_DUE, "Acme Corp", clientWallet);

        InvoiceLogger.Invoice memory inv = logger.getInvoice("INV-001");
        assertEq(inv.invoiceId,    "INV-001");
        assertEq(inv.issuer,       issuer);
        assertEq(inv.clientWallet, clientWallet);
        assertEq(inv.amountUSD,    80000);
        assertEq(inv.clientName,   "Acme Corp");
        assertEq(inv.dataHash,     h);
        assertEq(inv.dueTimestamp, FUTURE_DUE);
        assertEq(uint256(inv.status), uint256(InvoiceLogger.Status.UNPAID));
        assertFalse(inv.clientAcknowledged);
        assertFalse(inv.clientDisputed);
        assertTrue(inv.exists);
    }

    function test_LogInvoiceWithoutClientWallet() public {
        _logNoClient("INV-NOCLIENT", issuer, FUTURE_DUE);
        InvoiceLogger.Invoice memory inv = logger.getInvoice("INV-NOCLIENT");
        assertEq(inv.clientWallet, address(0));
    }

    function test_TotalInvoicesIncrement() public {
        _logNoClient("INV-X1", issuer, FUTURE_DUE);
        _logNoClient("INV-X2", issuer, FUTURE_DUE);
        assertEq(logger.totalInvoices(), 2);
    }

    function test_DuplicateInvoiceReverts() public {
        _logNoClient("INV-DUP", issuer, FUTURE_DUE);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.InvoiceAlreadyExists.selector, "INV-DUP"
        ));
        logger.logInvoice("INV-DUP", _hash("INV-DUP"), 10000, FUTURE_DUE, "Client", address(0));
    }

    function test_EmptyIdReverts() public {
        vm.prank(issuer);
        vm.expectRevert(InvoiceLogger.EmptyInvoiceId.selector);
        logger.logInvoice("", _hash("x"), 1000, FUTURE_DUE, "Client", address(0));
    }

    function test_EmptyHashReverts() public {
        vm.prank(issuer);
        vm.expectRevert(InvoiceLogger.EmptyHash.selector);
        logger.logInvoice("INV-Z", bytes32(0), 1000, FUTURE_DUE, "Client", address(0));
    }

    // ─── verifyInvoice ────────────────────────────────────────────────────────

    function test_VerifyInvoice() public {
        _logNoClient("INV-VER", issuer, FUTURE_DUE);
        bytes32 h = _hash("INV-VER");
        assertTrue(logger.verifyInvoice("INV-VER", h));
        assertFalse(logger.verifyInvoice("INV-VER", keccak256("wrong")));
    }

    // ─── getIssuerInvoices ────────────────────────────────────────────────────

    function test_GetIssuerInvoices() public {
        _logNoClient("INV-A", issuer, FUTURE_DUE);
        _logNoClient("INV-B", issuer, FUTURE_DUE);
        string[] memory ids = logger.getIssuerInvoices(issuer);
        assertEq(ids.length, 2);
        assertEq(ids[0], "INV-A");
        assertEq(ids[1], "INV-B");
    }

    // ─── getClientInvoices ────────────────────────────────────────────────────

    function test_GetClientInvoices() public {
        _log("INV-C1", issuer, FUTURE_DUE, clientWallet);
        _log("INV-C2", issuer, FUTURE_DUE, clientWallet);
        _logNoClient("INV-C3", issuer, FUTURE_DUE); // no client wallet

        string[] memory ids = logger.getClientInvoices(clientWallet);
        assertEq(ids.length, 2);
        assertEq(ids[0], "INV-C1");
        assertEq(ids[1], "INV-C2");
    }

    // ─── markPaid ─────────────────────────────────────────────────────────────

    function test_MarkPaid() public {
        _logNoClient("INV-PAY", issuer, FUTURE_DUE);
        vm.prank(issuer);
        logger.markPaid("INV-PAY");
        InvoiceLogger.Invoice memory inv = logger.getInvoice("INV-PAY");
        assertEq(uint256(inv.status), uint256(InvoiceLogger.Status.PAID));
    }

    function test_MarkPaidNotIssuerReverts() public {
        _logNoClient("INV-PAUTH", issuer, FUTURE_DUE);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.NotInvoiceIssuer.selector, "INV-PAUTH"
        ));
        logger.markPaid("INV-PAUTH");
    }

    function test_MarkPaidAlreadyPaidReverts() public {
        _logNoClient("INV-PP", issuer, FUTURE_DUE);
        vm.prank(issuer);
        logger.markPaid("INV-PP");
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.InvoiceAlreadyClosed.selector, "INV-PP"
        ));
        logger.markPaid("INV-PP");
    }

    // ─── cancelInvoice ────────────────────────────────────────────────────────

    function test_CancelInvoice() public {
        _logNoClient("INV-CAN", issuer, FUTURE_DUE);
        vm.prank(issuer);
        logger.cancelInvoice("INV-CAN");
        InvoiceLogger.Invoice memory inv = logger.getInvoice("INV-CAN");
        assertEq(uint256(inv.status), uint256(InvoiceLogger.Status.CANCELLED));
    }

    function test_CancelNotIssuerReverts() public {
        _logNoClient("INV-CAUTH", issuer, FUTURE_DUE);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.NotInvoiceIssuer.selector, "INV-CAUTH"
        ));
        logger.cancelInvoice("INV-CAUTH");
    }

    function test_CancelAlreadyPaidReverts() public {
        _logNoClient("INV-CP", issuer, FUTURE_DUE);
        vm.prank(issuer);
        logger.markPaid("INV-CP");
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.InvoiceAlreadyClosed.selector, "INV-CP"
        ));
        logger.cancelInvoice("INV-CP");
    }

    // ─── acknowledgeInvoice ───────────────────────────────────────────────────

    function test_AcknowledgeInvoice() public {
        _log("INV-ACK", issuer, FUTURE_DUE, clientWallet);
        vm.prank(clientWallet);
        logger.acknowledgeInvoice("INV-ACK");
        InvoiceLogger.Invoice memory inv = logger.getInvoice("INV-ACK");
        assertTrue(inv.clientAcknowledged);
        assertFalse(inv.clientDisputed);
    }

    function test_AcknowledgeWrongCallerReverts() public {
        _log("INV-ACKAUTH", issuer, FUTURE_DUE, clientWallet);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.NotInvoiceClient.selector, "INV-ACKAUTH"
        ));
        logger.acknowledgeInvoice("INV-ACKAUTH");
    }

    function test_AcknowledgeNoClientWalletReverts() public {
        _logNoClient("INV-ACKNC", issuer, FUTURE_DUE);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.NoClientWalletSet.selector, "INV-ACKNC"
        ));
        logger.acknowledgeInvoice("INV-ACKNC");
    }

    function test_AcknowledgeTwiceReverts() public {
        _log("INV-ACK2", issuer, FUTURE_DUE, clientWallet);
        vm.prank(clientWallet);
        logger.acknowledgeInvoice("INV-ACK2");
        vm.prank(clientWallet);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.InvoiceAlreadyAcknowledged.selector, "INV-ACK2"
        ));
        logger.acknowledgeInvoice("INV-ACK2");
    }

    // ─── disputeInvoice ───────────────────────────────────────────────────────

    function test_DisputeInvoice() public {
        _log("INV-DIS", issuer, FUTURE_DUE, clientWallet);
        vm.prank(clientWallet);
        logger.disputeInvoice("INV-DIS");
        InvoiceLogger.Invoice memory inv = logger.getInvoice("INV-DIS");
        assertTrue(inv.clientDisputed);
        assertFalse(inv.clientAcknowledged);
    }

    function test_DisputeWrongCallerReverts() public {
        _log("INV-DISAUTH", issuer, FUTURE_DUE, clientWallet);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.NotInvoiceClient.selector, "INV-DISAUTH"
        ));
        logger.disputeInvoice("INV-DISAUTH");
    }

    function test_DisputeNoClientWalletReverts() public {
        _logNoClient("INV-DISNC", issuer, FUTURE_DUE);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(
            InvoiceLogger.NoClientWalletSet.selector, "INV-DISNC"
        ));
        logger.disputeInvoice("INV-DISNC");
    }

    // ─── getOverdueInvoices ───────────────────────────────────────────────────

    function test_GetOverdueInvoices() public {
        _logNoClient("INV-OD1", issuer, PAST_DUE);
        _logNoClient("INV-OD2", issuer, FUTURE_DUE);
        _logNoClient("INV-OD3", issuer, PAST_DUE);
        vm.prank(issuer);
        logger.markPaid("INV-OD3");

        string[] memory overdue = logger.getOverdueInvoices(issuer);
        assertEq(overdue.length, 1);
        assertEq(overdue[0], "INV-OD1");
    }

    function test_GetOverdueInvoicesEmpty() public {
        _logNoClient("INV-FINE", issuer, FUTURE_DUE);
        assertEq(logger.getOverdueInvoices(issuer).length, 0);
    }

    // ─── invoiceExists ────────────────────────────────────────────────────────

    function test_InvoiceExists() public {
        assertFalse(logger.invoiceExists("INV-GHOST"));
        _logNoClient("INV-GHOST", issuer, FUTURE_DUE);
        assertTrue(logger.invoiceExists("INV-GHOST"));
    }
}
