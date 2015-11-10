
%nonassoc 'RETURN'
%nonassoc 'THEN'
%nonassoc 'EXPORT'

%nonassoc SHIFTER

%nonassoc 'IF'
%nonassoc 'ELSE'

%nonassoc 'TRY'
%nonassoc 'CATCH'
%nonassoc 'FINALLY'

%nonassoc 'ENDLN'
%nonassoc 'FOR'
%nonassoc 'WHILE'
%nonassoc 'IN' 'ON'
%right 'DO'


%nonassoc 'CLASS' 'EXTENDS'

%nonassoc 'THROW'

%nonassoc ','

%right 'ASSIGN'
%left 'YIELD'
%right 'NOT'
%left 'OR' 'AND'
%right '!'
%left 'COMPARE'

%left '+' '-' '&'
%left '*' '//' '%' '/'
%right UMIN UPLUS
%left '^'
%left 'AWAIT'
%right 'TYPEOF'
%nonassoc 'IS'
%right 'UB_FUNC' 'B_FUNC'

%right 'ACCESS'

%nonassoc 'INDEX_LEFT' 'INDEX_RIGHT'

%right 'NEW'

%nonassoc SUBCALL

%left 'CALL_LEFT' 'CALL_RIGHT'

%nonassoc '(' ')'
%nonassoc '{' '}'

%%


Program:
    'ENDLN' Lines           { return new yy.Program($2).pos(@$)}
|   'ENDLN' Lines 'ENDLN'   { return new yy.Program($2).pos(@$)}
|   'ENDLN' Lines ';'       { return new yy.Program($2).pos(@$)}
|   'ENDLN' Lines EOF       { return new yy.Program($2).pos(@$)}
;

Lines:
    Statement                { $$ = [$1]}
|   Lines ';' Statement      { $$ = $1.concat($3)}
|   Lines 'ENDLN' Statement  { $$ = $1.concat($3)}
;

Expression:
    AssignmentExpression
|	Number
|	String
|   FunctionExpression
|   Identifier          %prec SUBCALL
|   MemberExpression    %prec SUBCALL
|   ObjectExpression
|   ArrayExpression
|   ThisExpression
|   CallExpression
|   Operation
|   ComparativeExpression
|   Continuation
|	WrappedExpression   %prec SUBCALL
|   ClassExpression
;

Pattern:
    ArrayPattern
|   ObjectPattern
;


WrappedExpression:
    '(' Expression ')'  { $$ = $2}
;

Identifier:
    'NAME'      { $$ = new yy.Identifier($1).pos(@$)}
;

Statement:
	ReturnStatement
|   ThrowStatement
|   BlockableStatement
|   FunctionDeclaration
|   ClassDeclaration
|   ImportStatement
|   ExportStatement
|   VariableDeclaration
|   'BREAK'
|   'CONTINUE'
|   Expression              %prec SHIFTER  { $$ = new yy.ExpressionStatement($1).pos(@$)}
;

ReturnStatement:
    'RETURN'                                                        { $$ = new yy.ReturnStatement(null).pos(@$)}
|	'RETURN' Expression                                             { $$ = new yy.ReturnStatement($2).pos(@$)}
|	'RETURN' Expression 'THEN' Statement                            { $$ = new yy.ReturnStatement($2, $4).pos(@$)}
;

ThrowStatement:
    'THROW' Expression      { $$ = new yy.ThrowStatement($2).pos(@$)}
;

Continuation:
    'YIELD'                                         { $$ = new yy.YieldExpression(null).pos(@$)}
|   'YIELD' Expression                              { $$ = new yy.YieldExpression($2).pos(@$)}
|   'AWAIT'                                         { $$ = new yy.AwaitExpression(null).pos(@$)}
|   'AWAIT' Expression                              { $$ = new yy.AwaitExpression($2).pos(@$)}
;

String:
	'RICH_STRING'      { $$ = new yy.StringLiteral($1).pos(@$)}
|	'RAW_STRING'       { $$ = new yy.RawStringLiteral($1).pos(@$)}
|	'RICH_DOC'
|	'RAW_DOC'
;

Number:
	'FLOAT'  { $$ = new yy.NumberLiteral($1).pos(@$)} 
|	'INT'    { $$ = new yy.NumberLiteral($1).pos(@$)}
;


Separator:
    'ENDLN',
|   ','
;

BlockableStatement:
    IfStatement
|   ForStatement
|   WhileStatement
|   TryStatement
|   BlockStatement
;

BlockStatement:
    'DO' Statement                              
        {
            if ($2 instanceof yy.BlockStatement) $$ = $2.pos(@$);
            else $$ = new yy.BlockStatement([$2]).pos(@$);
        }
|   'BLOCK_LEFT' Lines 'BLOCK_RIGHT'            { $$ = new yy.BlockStatement($2).pos(@$)}
;

IfStatement:
    'IF' Expression BlockableStatement                              { $$ = new yy.IfStatement($2, $3, null).pos(@$)}
|   'IF' Expression BlockableStatement 'ELSE' BlockableStatement    { $$ = new yy.IfStatement($2, $3, $5).pos(@$)}
;

Assignable:
    Identifier
|   Pattern
;

ForStatement:
    'FOR' Assignable 'IN' Expression BlockableStatement     { $$ = new yy.ForStatement($2, $4, yy.wrap($5)).pos(@$)}
|   'FOR' Assignable 'ON' Expression BlockableStatement     { $$ = new yy.ForStatement($2, $4, yy.wrap($5), true).pos(@$)}
;

WhileStatement:
    'WHILE' Expression BlockableStatement       { $$ = new yy.WhileStatement($2, $3).pos(@$)}
;


TryStatement:
    'TRY' BlockableStatement
        {
            $$ = new yy.TryStatement($2).pos(@$)
        }
|   'TRY' BlockableStatement 'CATCH' Assignable BlockableStatement
        {
            $$ = new yy.TryStatement(
                $2,
                new yy.CatchClause($4, $5).pos(@4, @5)
                ).pos(@$)
        }
|   'TRY' BlockableStatement 'FINALLY' BlockableStatement
        {
            $$ = new yy.TryStatement($2, null, $4).pos(@$)
        }
|   'TRY' BlockableStatement 'CATCH' Assignable BlockableStatement 'FINALLY' BlockableStatement
        {
            $$ = new yy.TryStatement(
                $2,
                new yy.CatchClause($4, $5).pos(@4, @5),
                $7
                ).pos(@$)
        }
;

Property:
    Identifier                         
|   Identifier          ':' Expression  { $$ = new yy.Property($1, $3).pos(@$)}
|   String              ':' Expression  { $$ = new yy.Property($1, $3).pos(@$)}
|   WrappedExpression   ':' Expression  { $$ = new yy.Property($2, $5).pos(@$)}
;

Properties:
    Property                     { $$ = [$1]}
|   Properties 'ENDLN' Property  { $$ = $1.concat($3)}
|   Properties ',' Property      { $$ = $1.concat($3)}
;

ObjectExpression:
    '{' '}'             { $$ = new yy.ObjectExpression([]).pos(@$)}
|   '{' Properties '}'  { $$ = new yy.ObjectExpression($2).pos(@$)}
;


VariableDeclaration:
    'VAR' Assignable 'ASSIGN' Expression { 
        $$ = new yy.VariableDeclaration([new yy.VariableDeclarator($2, $4).pos(@2, @4)], false).pos(@$);
    }
|   'VAR' Identifier {
        $$ = new yy.VariableDeclaration([new yy.VariableDeclarator($2, null).pos(@2)], false).pos(@$);
    }
|   'CONST' Assignable 'ASSIGN' Expression { 
        $$ = new yy.VariableDeclaration([new yy.VariableDeclarator($2, $4).pos(@2, @4)], true).pos(@$);
    }
|   'CONST' Identifier {
        $$ = new yy.VariableDeclaration([new yy.VariableDeclarator($2, null).pos(@2)], true).pos(@$);
    }
|   VariableDeclaration ',' Assignable 'ASSIGN' Expression {
        $$ = $1.addAndReturn($3, $5).pos(@3, @5);
    }
|   VariableDeclaration ',' Identifier {
        $$ = $1.addAndReturn($3, null).pos(@$);
    }
;

ThisExpression:
    '@'     { $$ = new yy.ThisExpression().pos(@$)}
|   'THIS'  { $$ = new yy.ThisExpression().pos(@$)}
;

SpreadElement:
    'SPLAT' Expression  { $$ = new yy.SpreadElement($2).pos(@$)}
;

ExpressionLines:
    Expression                                  { $$ = [$1]}
|   SpreadElement                               { $$ = [$1]}
|   ExpressionLines Separator Expression        { $$ = $1.concat($3)}
|   ExpressionLines Separator SpreadElement     { $$ = $1.concat($3)}
;

ArrayExpression:
    '[' ']'                     { $$ = new yy.ArrayExpression([]).pos(@$)}
|   '[' ExpressionLines ']'     { $$ = new yy.ArrayExpression($2).pos(@$)}
;

Default:
    Pattern 'DEFVAL' Expression                 { $$ = new yy.DefaultPattern($1, $3).pos(@$)}
|   Identifier 'DEFVAL' Expression              { $$ = new yy.DefaultPattern($1, $3).pos(@$)}
|   MemberExpression 'DEFVAL' Expression        { $$ = new yy.DefaultPattern($1, $3).pos(@$)}
;


ArrayPatternLines:
    'AP_LEFT' Pattern                                           { $$ = [$2]}
|   'AP_LEFT' Identifier                                        { $$ = [$2]}
|   'AP_LEFT' MemberExpression                                  { $$ = [$2]}
|   'AP_LEFT' Default                                           { $$ = [$2]}
|   'AP_LEFT' 'SPLAT' Pattern                                   { $$ = [new yy.SpreadPattern($3).pos(@2, @3)]}
|   'AP_LEFT' 'SPLAT' Identifier                                { $$ = [new yy.SpreadPattern($3).pos(@2, @3)]}
|   ArrayPatternLines Separator Pattern                         { $$ = $1.concat($3)}
|   ArrayPatternLines Separator Identifier                      { $$ = $1.concat($3)}
|   ArrayPatternLines Separator MemberExpression                { $$ = $1.concat($3)}
|   ArrayPatternLines Separator Default                         { $$ = $1.concat($3)}
|   ArrayPatternLines Separator 'SPLAT' Pattern                 { $$ = $1.concat(new yy.SpreadPattern($4).pos(@3, @4))}
|   ArrayPatternLines Separator 'SPLAT' Identifier              { $$ = $1.concat(new yy.SpreadPattern($4).pos(@3, @4))}
;


ArrayPattern:
    'AP_LEFT' 'AP_RIGHT'                { $$ = new yy.ArrayPattery([]).pos(@$)}
|   ArrayPatternLines 'AP_RIGHT'        { $$ = new yy.ArrayPattern($1).pos(@$)}
;



ObjectPatternLines:
    'OP_LEFT' Identifier                                            { $$ = [$2]}
|   'OP_LEFT' Identifier ':' Pattern                                { $$ = [new yy.PropertyAlias($2, $4).pos(@2, @4)]}
|   'OP_LEFT' Identifier ':' Identifier                             { $$ = [new yy.PropertyAlias($2, $4).pos(@2, @4)]}
|   'OP_LEFT' Identifier '=' Expression                             { $$ = [new yy.Default($2, $4).pos(@2, @4)]}
|   'OP_LEFT' Identifier ':' Default                                { $$ = [new yy.PropertyAlias($2, $4).pos(@2, @4)]}
|   'OP_LEFT' Identifier ':' MemberExpression                       { $$ = [new yy.PropertyAlias($2, $4).pos(@2, @4)]}
|   ObjectPatternLines Separator Identifier                         { $$ = $1.concat($3)}
|   ObjectPatternLines Separator Identifier ':' Pattern             { $$ = $1.concat(new yy.PropertyAlias($3, $5).pos(@3, @5))}
|   ObjectPatternLines Separator Identifier ':' Identifier          { $$ = $1.concat(new yy.PropertyAlias($3, $5).pos(@3, @5))}
|   ObjectPatternLines Separator Identifier '=' Expression          { $$ = $1.concat(new yy.Default($3, $5).pos(@3, @5))}
|   ObjectPatternLines Separator Identifier ':' Default             { $$ = $1.concat(new yy.PropertyAlias($3, $5).pos(@3, @5))}
|   ObjectPatternLines Separator Identifier ':' MemberExpression    { $$ = $1.concat(new yy.PropertyAlias($3, $5).pos(@3, @5))}
;

ObjectPattern:
    'OP_LEFT' 'OP_RIGHT'            { $$ = new yy.ObjectPattern([]).pos(@$)}
|   ObjectPatternLines 'OP_RIGHT'   { $$ = new yy.ObjectPattern($1).pos(@$)}
;




ParamLines:
    'PARAM_LEFT' Pattern                                { $$ = [$2]}
|   'PARAM_LEFT' Identifier                             { $$ = [$2]}
|   'PARAM_LEFT' MemberExpression                       { $$ = [$2]}
|   'PARAM_LEFT' Default                                { $$ = [$2]}
|   'PARAM_LEFT' 'SPLAT' Pattern                        { $$ = [new yy.SpreadPattern($3).pos(@2, @3)]}
|   'PARAM_LEFT' 'SPLAT' Identifier                     { $$ = [new yy.SpreadPattern($3).pos(@2, @3)]}
|   ParamLines Separator Pattern                        { $$ = $1.concat($3)}
|   ParamLines Separator Identifier                     { $$ = $1.concat($3)}
|   ParamLines Separator MemberExpression               { $$ = $1.concat($3)}
|   ParamLines Separator Default                        { $$ = $1.concat($3)}
|   ParamLines Separator 'SPLAT' Pattern                { $$ = $1.concat(new yy.SpreadPattern($4).pos(@3, @4))}
|   ParamLines Separator 'SPLAT' Identifier             { $$ = $1.concat(new yy.SpreadPattern($4).pos(@3, @4))}
;

Parameters:
    'PARAM_LEFT' 'PARAM_RIGHT'  { $$ = []}
|   ParamLines 'PARAM_RIGHT'    { $$ = $1}
;

FunctionExpression:
    Parameters 'B_FUNC' BlockStatement {
        $$ = new yy.FunctionExpression($1, $3, true).pos(@$)
    }
|   Parameters 'UB_FUNC' BlockStatement {
        $$ = new yy.FunctionExpression($1, $3, false).pos(@$)
    }
|   Parameters 'B_FUNC' FunctionModifier BlockStatement {
        $$ = new yy.FunctionExpression($1, $4, true, $3).pos(@$)
    }
|   Parameters 'UB_FUNC' FunctionModifier BlockStatement {
        $$ = new yy.FunctionExpression($1, $4, false, $3).pos(@$)
    }
;











ClassExpressionHeader:
    'CLASS'                                    { $$ = [null, null]}
|   'CLASS' 'EXTENDS' Expression               { $$ = [null, $3]}
;

ClassDeclarationHeader:
    'CLASS' Identifier                          { $$ = [$2, null]}
|   'CLASS' Identifier 'EXTENDS' Expression     { $$ = [$2, $4]}
;

ClassLine:
    Identifier ':' Expression                                   { $$ = new yy.ClassProperty($1, $3).pos(@$)}
|   Identifier FunctionExpression                               { $$ = new yy.MethodDefinition($1, $2).pos(@$)}
|   'GET' Identifier FunctionExpression                         { $$ = new yy.MethodDefinition($2, $3, 'get').pos(@$)}
|   'SET' Identifier FunctionExpression                         { $$ = new yy.MethodDefinition($2, $3, 'set').pos(@$)}
|   'STATIC' Identifier FunctionExpression                      { $$ = new yy.MethodDefinition($2, $3, null, true).pos(@$)}
|   'STATIC' 'GET' Identifier FunctionExpression                { $$ = new yy.MethodDefinition($3, $4, 'get', true).pos(@$)}
|   'STATIC' 'SET' Identifier FunctionExpression                { $$ = new yy.MethodDefinition($3, $4, 'set', true).pos(@$)}
;

ClassBody:
    ClassLine                       { $$ = [$1]}
|   ClassBody 'ENDLN' ClassLine     { $$ = $1.concat($3)}  
;

ClassExpression:
    ClassExpressionHeader '{' ClassBody '}'         { $$ = new yy.ClassExpression($1[0], $1[1], $3)}
|   ClassExpressionHeader '{' '}'                   { $$ = new yy.ClassExpression($1[0], $1[1], [])}
;

ClassDeclaration:
    ClassDeclarationHeader '{' ClassBody '}'         { $$ = new yy.ClassExpression($1[0], $1[1], $3)}
|   ClassDeclarationHeader '{' '}'                   { $$ = new yy.ClassExpression($1[0], $1[1], [])}
;










FunctionDeclaration:
    Identifier FunctionExpression                       { $$ = new yy.FunctionDeclaration($1, $2).pos(@$)}
;

FunctionModifier:
    'FUNC_TYPE_GENERATOR'   { $$ = '*'}
|   'FUNC_TYPE_ASYNC'       { $$ = '~'}
|   'FUNC_TYPE_AGEN'        { $$ = '~*'}
;

Operation:
    BinaryExpression
|   LogicalExpression
|   UnaryExpression
;


LogicalExpression:
    Expression 'OR' Expression  { $$ = new yy.LogicalExpression('or', $1, $3).pos(@$)}
|   Expression 'AND' Expression { $$ = new yy.LogicalExpression('and', $1, $3).pos(@$)}
;

ComparativeExpression:
    Expression 'COMPARE' Expression                                 { $$ = new yy.ComparativeExpression($2, $1, $3).pos(@$)}
|   ComparativeExpression COMPARE Expression  %prec CHAIN           { $$ = $1.chain($2, $3).pos(@$)}
;

BinaryExpression:
    Expression '&' Expression   { $$ = new yy.BinaryExpression('&', $1, $3).pos(@$)}
|   Expression '+' Expression   { $$ = new yy.BinaryExpression('+', $1, $3).pos(@$)}
|   Expression '-' Expression   { $$ = new yy.BinaryExpression('-', $1, $3).pos(@$)}
|   Expression '*' Expression   { $$ = new yy.BinaryExpression('*', $1, $3).pos(@$)}
|   Expression '/' Expression   { $$ = new yy.BinaryExpression('/', $1, $3).pos(@$)}
|   Expression '//' Expression  { $$ = new yy.BinaryExpression('//', $1, $3).pos(@$)}
|   Expression '%' Expression   { $$ = new yy.BinaryExpression('%', $1, $3).pos(@$)}
|   Expression '^' Expression   { $$ = new yy.BinaryExpression('^', $1, $3).pos(@$)}
|   Expression 'IS' Expression  { $$ = new yy.BinaryExpression('instanceof', $1, $3).pos(@$)}
;

UnaryExpression:
    '-' Expression      %prec UMIN      { $$ = new yy.UnaryExpression('-', $2).pos(@$)}
|   '+' Expression      %prec UPLUS     { $$ = new yy.UnaryExpression('+', $2).pos(@$)}
|   '!' Expression                      { $$ = new yy.UnaryExpression('!', $2).pos(@$)}
|   'NOT' Expression                    { $$ = new yy.UnaryExpression('!', $2).pos(@$)}
;

Arguments:
    'CALL_LEFT' ExpressionLines 'CALL_RIGHT'    { $$ = $2}
|   'CALL_LEFT' 'CALL_RIGHT'                    { $$ = []}
;


MemberExpression:
    Expression 'INDEX_LEFT' Expression 'INDEX_RIGHT'    { $$ = new yy.MemberExpression($1, $3, true).pos(@$)}
|   Expression 'ACCESS' Identifier                      { $$ = new yy.MemberExpression($1, $3).pos(@$)}
|   '@' 'Identifier'                                    { $$ = new yy.MemberExpression(new yy.ThisExpression().pos(@1), $2).pos(@$)}
;

AssignmentExpression:
    MemberExpression 'ASSIGN' Expression                { $$ = new yy.AssignmentExpression($2, $1, $3).pos(@$)}
|   Pattern 'ASSIGN' Expression                         { $$ = new yy.AssignmentExpression($2, $1, $3).pos(@$)}
|   Identifier 'ASSIGN' Expression                      { $$ = new yy.AssignmentExpression($2, $1, $3).pos(@$)}
;

CallExpression:
    Expression Arguments                    { $$ = new yy.CallExpression($1, $2).pos(@$)}
|   'NEW' MemberExpression Arguments        { $$ = new yy.CallExpression($2, $3, true).pos(@$)}
|   'NEW' Identifier Arguments              { $$ = new yy.CallExpression($2, $3, true).pos(@$)}
|   'NEW' WrappedExpression Arguments       { $$ = new yy.CallExpression($2, $3, true).pos(@$)}
;

Path:
    'PATH'
;

ImportListLines:
    'MOD_LEFT' Identifier                   { $$ = [$2] }
|   'MOD_LEFT' ModuleAlias                  { $$ = [$2] }
|   ImportListLines Separator Identifier    { $$ = $1.concat($3) }
|   ImportListLines Separator ModuleAlias   { $$ = $1.concat($3) }
;

ImportList:
    ImportListLines 'MOD_RIGHT'         { $$ = $1 }
;

ModuleAlias:
    'ALL' 'AS' Identifier           { $$ = new yy.ModuleAlias(new yy.All().pos(@1), $3).pos(@$)}
|   Identifier 'AS' Assignable         { $$ = new yy.ModuleAlias($1, $3).pos(@$)}
;

ImportStatement:
    'IMPORT' Identifier 'FROM' Path                     { $$ = new yy.ImportStatement($2, $4).pos(@$)}
|   'IMPORT' ModuleAlias 'FROM' Path                    { $$ = new yy.ImportStatement($2, $4).pos(@$)}
|   'IMPORT' ImportList 'FROM' Path                     { $$ = new yy.ImportStatement($2, $4).pos(@$)}
;


ExportListLines:
    'EXP_LEFT' Identifier                   { $$ = [$2] }
|   'EXP_LEFT' ModuleAlias                  { $$ = [$2] }
|   ExportListLines Separator Identifier    { $$ = $1.concat($3) }
|   ExportListLines Separator ModuleAlias   { $$ = $1.concat($3) }
;

ExportList:
    ExportListLines 'EXP_RIGHT'         { $$ = $1 }
;

ExportStatement:
    'EXPORT' VariableDeclaration                { $$ = new yy.ExportStatement($2).pos(@$)}
|   'EXPORT' FunctionDeclaration                { $$ = new yy.ExportStatement($2).pos(@$)}
|   'EXPORT' ClassDeclaration                   { $$ = new yy.ExportStatement($2).pos(@$)}
|   'EXPORT' ExportList                         { $$ = new yy.ExportStatement($2).pos(@$)}
|   'EXPORT' 'DEFAULT' Expression               { $$ = new yy.ExportStatement($3, true).pos(@$)}
;

