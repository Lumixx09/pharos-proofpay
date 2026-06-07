// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title InvoiceLogger
 * @author iEngineer Solutions
 * @notice Immutable onchain invoice registry for freelancers on Pharos.
 *         Stores a tamper-proof hash + timestamp for every invoice issued.
 *         Supports full invoice lifecycle: UNPAID → PAID or CANCELLED.
 *         Supports optional client wallet registration for onchain acknowledgment
 *         or dispute — turning the system from proof-of-issuance into proof-of-agreement.
 */
contract InvoiceLogger {

    // ─── Types ────────────────────────────────────────────────────────────────

    enum Status { UNPAID, PAID, CANCELLED }

    struct Invoice {
        string  invoiceId;          // e.g. "INV-2026-001"
        bytes32 dataHash;           // keccak256 of invoice JSON
        address issuer;             // wallet that logged the invoice
        address clientWallet;       // client wallet for acknowledgment (address(0) = not set)
        uint256 timestamp;          // block timestamp at logging
        uint256 dueTimestamp;       // Unix timestamp of payment due date
        uint256 amountUSD;          // invoice value in USD cents (e.g. 80000 = $800.00)
        string  clientName;         // client display name
        Status  status;             // current invoice lifecycle status
        bool    clientAcknowledged; // true if client wallet signed acknowledgment
        bool    clientDisputed;     // true if client wallet raised a dispute
        bool    exists;             // guard for lookups
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(string => Invoice)   private _invoices;
    mapping(address => string[]) private _issuerInvoices;
    mapping(address => string[]) private _clientInvoices;
    uint256 public totalInvoices;

    // ─── Events ───────────────────────────────────────────────────────────────

    event InvoiceLogged(
        string  indexed invoiceId,
        address indexed issuer,
        address         clientWallet,
        bytes32         dataHash,
        uint256         amountUSD,
        string          clientName,
        uint256         dueTimestamp,
        uint256         timestamp
    );

    event InvoicePaid(
        string  indexed invoiceId,
        address indexed issuer,
        uint256         timestamp
    );

    event InvoiceCancelled(
        string  indexed invoiceId,
        address indexed issuer,
        uint256         timestamp
    );

    event InvoiceAcknowledged(
        string  indexed invoiceId,
        address indexed clientWallet,
        uint256         timestamp
    );

    event InvoiceDisputed(
        string  indexed invoiceId,
        address indexed clientWallet,
        uint256         timestamp
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error InvoiceAlreadyExists(string invoiceId);
    error InvoiceNotFound(string invoiceId);
    error NotInvoiceIssuer(string invoiceId);
    error NotInvoiceClient(string invoiceId);
    error NoClientWalletSet(string invoiceId);
    error InvoiceAlreadyClosed(string invoiceId);
    error InvoiceAlreadyAcknowledged(string invoiceId);
    error EmptyInvoiceId();
    error EmptyHash();

    // ─── Write ────────────────────────────────────────────────────────────────

    /**
     * @notice Log a new invoice onchain.
     * @param invoiceId    Unique invoice identifier (e.g. "INV-2026-001")
     * @param dataHash     keccak256 hash of the full invoice JSON
     * @param amountUSD    Invoice value in USD cents
     * @param dueTimestamp Unix timestamp of payment due date
     * @param clientName   Client display name
     * @param clientWallet Client wallet address for acknowledgment. Pass address(0) to skip.
     */
    function logInvoice(
        string  calldata invoiceId,
        bytes32          dataHash,
        uint256          amountUSD,
        uint256          dueTimestamp,
        string  calldata clientName,
        address          clientWallet
    ) external {
        if (bytes(invoiceId).length == 0) revert EmptyInvoiceId();
        if (dataHash == bytes32(0))       revert EmptyHash();
        if (_invoices[invoiceId].exists)  revert InvoiceAlreadyExists(invoiceId);

        _invoices[invoiceId] = Invoice({
            invoiceId:          invoiceId,
            dataHash:           dataHash,
            issuer:             msg.sender,
            clientWallet:       clientWallet,
            timestamp:          block.timestamp,
            dueTimestamp:       dueTimestamp,
            amountUSD:          amountUSD,
            clientName:         clientName,
            status:             Status.UNPAID,
            clientAcknowledged: false,
            clientDisputed:     false,
            exists:             true
        });

        _issuerInvoices[msg.sender].push(invoiceId);

        if (clientWallet != address(0)) {
            _clientInvoices[clientWallet].push(invoiceId);
        }

        totalInvoices++;

        emit InvoiceLogged(
            invoiceId,
            msg.sender,
            clientWallet,
            dataHash,
            amountUSD,
            clientName,
            dueTimestamp,
            block.timestamp
        );
    }

    /**
     * @notice Mark an invoice as paid. Only the original issuer can call this.
     */
    function markPaid(string calldata invoiceId) external {
        Invoice storage inv = _invoices[invoiceId];
        if (!inv.exists)                 revert InvoiceNotFound(invoiceId);
        if (inv.issuer != msg.sender)    revert NotInvoiceIssuer(invoiceId);
        if (inv.status != Status.UNPAID) revert InvoiceAlreadyClosed(invoiceId);

        inv.status = Status.PAID;
        emit InvoicePaid(invoiceId, msg.sender, block.timestamp);
    }

    /**
     * @notice Cancel an invoice. Only the original issuer can call this.
     *         The record is preserved onchain — it is never deleted.
     */
    function cancelInvoice(string calldata invoiceId) external {
        Invoice storage inv = _invoices[invoiceId];
        if (!inv.exists)                 revert InvoiceNotFound(invoiceId);
        if (inv.issuer != msg.sender)    revert NotInvoiceIssuer(invoiceId);
        if (inv.status != Status.UNPAID) revert InvoiceAlreadyClosed(invoiceId);

        inv.status = Status.CANCELLED;
        emit InvoiceCancelled(invoiceId, msg.sender, block.timestamp);
    }

    /**
     * @notice Client acknowledges they received and agree to this invoice.
     *         Only callable by the clientWallet registered at logging time.
     *         Once acknowledged, it cannot be undone — it is permanent proof of agreement.
     */
    function acknowledgeInvoice(string calldata invoiceId) external {
        Invoice storage inv = _invoices[invoiceId];
        if (!inv.exists)                          revert InvoiceNotFound(invoiceId);
        if (inv.clientWallet == address(0))       revert NoClientWalletSet(invoiceId);
        if (inv.clientWallet != msg.sender)       revert NotInvoiceClient(invoiceId);
        if (inv.clientAcknowledged)               revert InvoiceAlreadyAcknowledged(invoiceId);

        inv.clientAcknowledged = true;
        emit InvoiceAcknowledged(invoiceId, msg.sender, block.timestamp);
    }

    /**
     * @notice Client disputes this invoice — places a permanent onchain record
     *         that the registered client wallet disagrees with this invoice.
     *         Only callable by the clientWallet registered at logging time.
     *         A disputed invoice can still be cancelled by the issuer.
     */
    function disputeInvoice(string calldata invoiceId) external {
        Invoice storage inv = _invoices[invoiceId];
        if (!inv.exists)                    revert InvoiceNotFound(invoiceId);
        if (inv.clientWallet == address(0)) revert NoClientWalletSet(invoiceId);
        if (inv.clientWallet != msg.sender) revert NotInvoiceClient(invoiceId);

        inv.clientDisputed = true;
        emit InvoiceDisputed(invoiceId, msg.sender, block.timestamp);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /**
     * @notice Fetch a single invoice record by ID.
     */
    function getInvoice(string calldata invoiceId)
        external
        view
        returns (Invoice memory)
    {
        if (!_invoices[invoiceId].exists) revert InvoiceNotFound(invoiceId);
        return _invoices[invoiceId];
    }

    /**
     * @notice Verify that a given hash matches the logged invoice.
     */
    function verifyInvoice(string calldata invoiceId, bytes32 dataHash)
        external
        view
        returns (bool)
    {
        if (!_invoices[invoiceId].exists) revert InvoiceNotFound(invoiceId);
        return _invoices[invoiceId].dataHash == dataHash;
    }

    /**
     * @notice Get all invoice IDs logged by a specific issuer wallet.
     */
    function getIssuerInvoices(address issuer)
        external
        view
        returns (string[] memory)
    {
        return _issuerInvoices[issuer];
    }

    /**
     * @notice Get all invoice IDs where a wallet is registered as the client.
     */
    function getClientInvoices(address client)
        external
        view
        returns (string[] memory)
    {
        return _clientInvoices[client];
    }

    /**
     * @notice Get all UNPAID invoices past their due date for a given issuer.
     */
    function getOverdueInvoices(address issuer)
        external
        view
        returns (string[] memory)
    {
        string[] storage all = _issuerInvoices[issuer];
        uint256 count = 0;

        for (uint256 i = 0; i < all.length; i++) {
            Invoice storage inv = _invoices[all[i]];
            if (inv.status == Status.UNPAID && inv.dueTimestamp > 0 && inv.dueTimestamp < block.timestamp) {
                count++;
            }
        }

        string[] memory result = new string[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            Invoice storage inv = _invoices[all[i]];
            if (inv.status == Status.UNPAID && inv.dueTimestamp > 0 && inv.dueTimestamp < block.timestamp) {
                result[idx++] = all[i];
            }
        }
        return result;
    }

    /**
     * @notice Check if an invoice ID is already taken.
     */
    function invoiceExists(string calldata invoiceId)
        external
        view
        returns (bool)
    {
        return _invoices[invoiceId].exists;
    }
}
