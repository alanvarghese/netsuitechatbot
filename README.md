# NetSuite AI Chatbot

A comprehensive AI-powered chatbot for NetSuite that enables natural language queries and automated transaction processing. This chatbot can execute SuiteQL queries, approve transactions, receive purchase orders, and more through simple conversational commands.

## 🚀 Features

### Core Functionality
- **Natural Language to SQL**: Converts user questions into SuiteQL queries using OpenAI GPT-4o-mini
- **Interactive Chat Interface**: Web-based chat UI with message history and file downloads
- **CSV Export**: Automatic CSV file generation for large query results with proper headers
- **Transaction Processing**: Direct approval and receiving of transactions through chat commands

### Supported Transaction Operations
- **Purchase Order Receiving**: `receive PO555` or `receive Purchase Order 555`
- **Multi-Transaction Approval**: 
  - Purchase Orders: `approve PO555`
  - Vendor Bills: `approve Bill123`
  - Journal Entries: `approve Journal456`
- **Status Validation**: Prevents duplicate approvals and validates transaction states

### Advanced Query Capabilities
- **Dynamic Table Selection**: Automatically identifies relevant NetSuite tables based on user queries
- **Error Recovery**: Automatically retries failed queries with improved syntax
- **Result Optimization**: Handles both small result sets (inline display) and large datasets (CSV export)

## 📁 File Structure

```
chatbotv2/
├── ln_chatbot_suite.js          # Main SuiteScript 2.1 Suitelet
├── chatbot.html                 # Frontend chat interface
├── README.md                    # This documentation
└── tables/                      # NetSuite table schema files
    ├── Account.txt
    ├── transaction.txt
    └── ... (additional table definitions)
```

## 🔧 Technical Architecture

### Backend (ln_chatbot_suite.js)

**SuiteScript Type**: Suitelet (2.1)  
**Dependencies**: N/llm, N/query, N/runtime, N/file, N/https, N/log, N/search, N/record

#### Key Functions

##### `postFunction(context)`
Main request handler that:
1. Processes incoming chat messages
2. Detects command patterns (receive/approve)
3. Routes to appropriate handlers or generates SQL queries

##### `handleDirectPurchaseOrderReceive(context, user_input, current_chatId, poNumber)`
Processes purchase order receiving commands:
- Finds PO by transaction ID using SuiteQL
- Validates PO exists and status
- Creates item receipt using `record.transform()`
- Returns success/error messages with receipt details

##### `handleDirectPurchaseOrderApprove(context, user_input, current_chatId, poNumber)`
Handles purchase order approvals (legacy function, maintained for compatibility)

##### `handleGenericTransactionApprove(context, user_input, current_chatId, transactionType, transactionNumber)`
Generic approval handler supporting:
- **Purchase Orders**: Uses `record.Type.PURCHASE_ORDER`
- **Vendor Bills**: Uses `record.Type.VENDOR_BILL` 
- **Journal Entries**: Uses `record.Type.JOURNAL_ENTRY`

##### `generateSQLQueryFromLLM(addToUserInput)`
LLM integration for SQL generation:
- Uses OpenAI GPT-4o-mini model via HTTPS API
- Incorporates table schemas and business context
- Handles query refinement on errors

##### `getTableContentFromFileCabinet(tableList)`
Dynamic schema loading:
- Searches File Cabinet for relevant table definition files
- Loads multiple table schemas in single operation
- Provides context for accurate SQL generation

### Frontend (chatbot.html)

**Framework**: Vanilla JavaScript with Bootstrap styling  
**Features**:
- Real-time chat interface
- Message history persistence
- CSV file download integration
- Tab-based results display

## 🛠 Setup Instructions

### 1. NetSuite Configuration

#### Script Parameters
Configure the following script parameters in NetSuite:

| Parameter ID | Description | Example Value |
|--------------|-------------|---------------|
| `custscript_chatbot_preamble_file_id` | Main system prompt file | File ID in File Cabinet |
| `custscript_chat_history_file_id_ln` | Chat history storage file | File ID for JSON history |
| `custscript_chatbot_o2c_file_id` | Order-to-Cash table mapping | File ID for table definitions |
| `custscript_openai_api_key` | OpenAI API key for GPT-4o-mini | Your OpenAI API key |

#### File Cabinet Setup
1. **Upload HTML File**: Upload `chatbot.html` to File Cabinet
2. **Create Table Definition Files**: Upload `.txt` files for each NetSuite table schema
3. **Set Up Preamble**: Create system prompt file with business context
4. **Initialize History File**: Create empty JSON array file for chat history

#### Script Deployment
1. Create new Suitelet script record
2. Upload `ln_chatbot_suite.js` as script file
3. Deploy with appropriate audience and parameters
4. Note the external URL for access

### 2. Required Permissions

Ensure the script has permissions for:
- **Records**: Purchase Order, Item Receipt, Vendor Bill, Journal Entry (View, Create, Edit)
- **SuiteQL**: Query execution permissions
- **File Cabinet**: Read/Write access for history and CSV files

### 3. OpenAI Integration

1. **Get API Key**: Sign up at OpenAI and obtain API key
2. **Configure Model**: Uses `gpt-4o-mini` (cost-effective, fast responses)
3. **Set Temperature**: Default 0.2 for consistent, focused responses

## 💬 Usage Examples

### Natural Language Queries
```
User: "Show me all purchase orders from last month"
Bot: Generates SuiteQL query and returns results

User: "What vendors have the highest spending this year?"
Bot: Creates aggregated query with vendor analysis
```

### Transaction Commands
```
User: "receive PO555"
Bot: ✅ Success! Purchase Order 555 from ABC Vendor has been fully received. Item Receipt IR1001 has been created.

User: "approve Bill123"
Bot: ✅ Success! Vendor Bill 123 from XYZ Company has been approved and is now ready for processing.

User: "approve Journal JE456"  
Bot: ✅ Success! Journal Entry JE456 has been approved and is now ready for processing.
```

### Pending Approvals Query
```sql
-- Example query for pending journals
SELECT t.tranid AS "Journal Number", 
       t.trandate AS "Journal Date", 
       t.memo AS "Description",
       ABS(t.foreigntotal) AS "Total Amount"
FROM transaction t 
INNER JOIN transactionstatus ts ON t.status = ts.id 
WHERE t.type = 'Journal' 
AND ts.name = 'Pending Approval'
```

## 🔍 Command Patterns

### Receiving Commands
- `receive PO555`
- `receive Purchase Order ABC123`
- `RECEIVE PO 999` (case insensitive)

### Approval Commands
- `approve PO555` → Purchase Order approval
- `approve Bill123` → Vendor Bill approval  
- `approve Vendor Bill VB456` → Vendor Bill approval (alternative syntax)
- `approve Journal JE789` → Journal Entry approval
- `approve Journal Entry JE999` → Journal Entry approval (alternative syntax)

**Pattern Matching**: Uses regex patterns to detect commands:
```javascript
const poReceivePattern = /(receive)\s+(po|purchase\s+order)\s*(\w+)/i;
const genericApprovePattern = /(approve)\s+(po|purchase\s+order|bill|vendor\s+bill|journal|journal\s+entry)\s*(\w+)/i;
```

## 📊 Data Flow

### Query Processing Flow
1. **Input Processing**: User message received via POST request
2. **Pattern Detection**: Check for direct commands (receive/approve)
3. **Table Identification**: LLM identifies relevant NetSuite tables
4. **Schema Loading**: Load table definitions from File Cabinet
5. **SQL Generation**: Create SuiteQL query using OpenAI
6. **Query Execution**: Run query against NetSuite database
7. **Result Processing**: Format results or create CSV file
8. **Response Delivery**: Send formatted response to user

### Transaction Processing Flow
1. **Command Detection**: Regex pattern matching
2. **Transaction Lookup**: SuiteQL query to find transaction
3. **Validation**: Check transaction exists and current status
4. **Record Operations**: Load, modify, and save NetSuite records
5. **Response Generation**: Success/error message with details
6. **History Logging**: Append transaction to chat history

## ⚠️ Error Handling

### Query Errors
- **Syntax Errors**: Automatic retry with error context
- **Permission Errors**: Clear error messages to user
- **Large Results**: Automatic CSV generation for >5 rows

### Transaction Errors
- **Not Found**: User-friendly "transaction not found" message
- **Already Approved**: Warning about duplicate approval attempts
- **Permission Issues**: Specific error about approval permissions
- **System Errors**: Detailed logging for debugging

### Comprehensive Logging
```javascript
log.debug('User Input Processing', { 
    userInput: user_input,
    chatId: current_chatId,
    patternMatched: true 
});

log.audit('Transaction Approved Successfully', {
    transactionType: 'Purchase Order',
    transactionNumber: 'PO555',
    transactionId: '12345',
    previousStatus: 'Pending Approval',
    newStatus: 'Approved'
});
```

## 🚀 Performance Optimization

### File Operations
- **Batch Table Loading**: Single search for multiple table files
- **Efficient CSV Generation**: Streaming file creation with headers
- **History Management**: Append-only operations for chat history

### Query Optimization  
- **Smart Table Selection**: Only load relevant table schemas
- **Result Size Management**: Automatic CSV export for large datasets
- **Error Recovery**: Single retry mechanism with context

### API Efficiency
- **Temperature Setting**: 0.2 for consistent, focused responses
- **Model Selection**: GPT-4o-mini for cost-effective operations
- **Context Management**: Relevant business context only

## 🔐 Security Considerations

### Access Control
- NetSuite role-based permissions for all operations
- Script deployment audience restrictions
- File Cabinet folder permissions

### API Security
- Secure OpenAI API key storage in script parameters
- HTTPS-only communication with external APIs
- Input validation and sanitization

### Data Protection
- No sensitive data logged in debug messages
- Secure file operations within NetSuite environment
- Transaction validation before processing

## 🛡️ Maintenance & Monitoring

### Regular Tasks
1. **Monitor API Usage**: Track OpenAI API consumption
2. **Review Chat History**: Analyze user patterns and common queries  
3. **Update Table Schemas**: Keep table definitions current with NetSuite changes
4. **Performance Monitoring**: Check script execution times and limits

### Troubleshooting
- **Check Execution Logs**: NetSuite > Customization > Scripting > Script Execution Log
- **Verify File Cabinet**: Ensure all required files exist and are accessible
- **Test API Connection**: Validate OpenAI API key and connectivity
- **Review Permissions**: Confirm script has required NetSuite permissions

## 🔄 Version History & Updates

### Current Features
- Multi-transaction approval support
- Generic transaction processing
- Enhanced CSV export with headers
- Comprehensive error handling
- OpenAI GPT-4o-mini integration

### Future Enhancements
- Additional transaction types (Sales Orders, Invoices)
- Bulk transaction processing
- Advanced analytics and reporting
- Integration with NetSuite workflows
- Mobile-optimized interface

## 📞 Support & Contributing

### Getting Help
1. Check NetSuite execution logs for detailed error information
2. Review script parameters and file cabinet setup
3. Validate OpenAI API key and permissions
4. Test with simple queries before complex operations

### Development Guidelines
- Follow NetSuite SuiteScript 2.1 best practices
- Use comprehensive error handling and logging
- Test all transaction types in sandbox environment
- Document any new command patterns or features

---

*This chatbot represents a sophisticated integration of AI language models with NetSuite's business logic, providing users with a natural, efficient way to interact with their ERP data and processes.*