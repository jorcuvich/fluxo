let nodes = [];
let links = [];
let variables = {};

let draggedNode = null;
let dragOffset = { x: 0, y: 0 };
let connectingData = null;
let tempLine = null;
let currentNode = null;
let currentZoom = 1;
let isAnimating = false;

// Controle de Execução
let autoRun = false;
let inputResolver = null;
let outputResolver = null;

const camera = document.getElementById('camera');
const workspace = document.getElementById('workspace');
const nodesLayer = document.getElementById('nodes-layer');
const svgLayer = document.getElementById('svg-layer');
const animLayer = document.getElementById('anim-layer');
const memoryUI = document.getElementById('memory-ui');
const connIndicator = document.getElementById('connecting-indicator');
const btnNext = document.getElementById('btn-next');
const btnRunAll = document.getElementById('btn-run-all');

window.onload = () => {
    camera.scrollLeft = 2500 - camera.clientWidth / 2;
    camera.scrollTop = 2500 - camera.clientHeight / 2;
};

// --- SISTEMA DE CONSOLE LOG ---
function logMsg(msg, type='info') {
    const consoleUI = document.getElementById('console-ui');
    const color = type === 'error' ? 'var(--danger)' : (type === 'warn' ? 'var(--warn)' : 'var(--accent)');
    const prefix = type === 'error' ? '✖ ERRO:' : (type === 'warn' ? '⚠ AVISO:' : '▶');
    
    consoleUI.innerHTML += `<div style="margin-bottom:6px; border-bottom:1px dashed #444; padding-bottom:6px;"><span style="color:${color}; font-weight:bold;">${prefix}</span> ${msg}</div>`;
    consoleUI.scrollTop = consoleUI.scrollHeight;
}

// --- SISTEMA DE MODAL (ENTRADA) ---
function askInput(varName) {
    document.getElementById('input-label').innerText = `Valor para '${varName}':`;
    document.getElementById('modal-input').style.display = 'flex';
    const inputField = document.getElementById('input-value');
    inputField.value = '';
    inputField.focus();
    return new Promise(resolve => { inputResolver = resolve; });
}

function confirmInput() {
    const val = document.getElementById('input-value').value;
    document.getElementById('modal-input').style.display = 'none';
    if(inputResolver) inputResolver(val);
}

function cancelInput() {
    document.getElementById('modal-input').style.display = 'none';
    if(inputResolver) inputResolver(null); 
}

// --- SISTEMA DE MODAL (SAÍDA) ---
function showOutput(msg) {
    document.getElementById('output-value').innerText = msg;
    document.getElementById('modal-output').style.display = 'flex';
    document.getElementById('btn-close-output').focus(); 
    return new Promise(resolve => { outputResolver = resolve; });
}

function closeOutput() {
    document.getElementById('modal-output').style.display = 'none';
    if(outputResolver) outputResolver();
}

// --- CONTROLE UNIVERSAL PELO TECLADO (ENTER) ---
document.addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
        if (document.getElementById('modal-input').style.display === 'flex') {
            confirmInput();
        } else if (document.getElementById('modal-output').style.display === 'flex') {
            closeOutput();
        } else if (document.activeElement.tagName !== 'INPUT') {
            if (!isAnimating && !autoRun) runStep();
        }
    }
});

// --- LIMPAR TELA E GERENCIAR PROJETOS ---
function limparTela() {
    if (nodes.length === 0) return;
    if (confirm("Tem certeza que deseja apagar todo o fluxograma? O progresso não salvo será perdido.")) {
        nodes = [];
        links = [];
        resetExecution(); 
        renderNodes();
        renderSVG();
        
        camera.scrollLeft = 2500 - camera.clientWidth / 2;
        camera.scrollTop = 2500 - camera.clientHeight / 2;
        resetZoom();
        document.getElementById('console-ui').innerHTML = 'Projeto limpo. Aguardando...';
    }
}

function exportarProjeto() {
    if (nodes.length === 0) { logMsg("O projeto está vazio. Adicione blocos antes de salvar.", "warn"); return; }
    
    const projeto = { nodes, links, variables };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projeto));
    
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "logica_flow_projeto.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importarProjeto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const projeto = JSON.parse(e.target.result);
            if (projeto.nodes && Array.isArray(projeto.nodes)) {
                nodes = projeto.nodes;
                links = projeto.links || [];
                variables = projeto.variables || {};
                
                resetExecution(); 
                renderNodes();
                renderSVG();
                updateMemory();
                logMsg("Projeto carregado com sucesso!", "info");
            } else {
                throw new Error("Estrutura do arquivo inválida.");
            }
        } catch (err) {
            logMsg("Erro ao ler o arquivo: " + err.message, "error");
        }
    };
    reader.readAsText(file);
    event.target.value = ""; 
}

// --- NAVEGAÇÃO E ZOOM ---
function changeZoom(delta) {
    currentZoom = Math.max(0.4, Math.min(currentZoom + delta, 2)); 
    document.documentElement.style.setProperty('--zoom', currentZoom);
    renderSVG(); 
}
function resetZoom() {
    currentZoom = 1;
    document.documentElement.style.setProperty('--zoom', currentZoom);
    renderSVG();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    document.querySelector('.close-mobile').style.display = window.innerWidth <= 768 ? 'block' : 'none';
}

function getRealCoords(e) {
    const rect = workspace.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) / currentZoom,
        y: (e.clientY - rect.top) / currentZoom
    };
}

// --- GESTÃO DE BLOCOS E EVENTOS ---
function addNode(type) {
    const id = 'node_' + Date.now();
    const centerRealX = (camera.scrollLeft + camera.clientWidth / 2) / currentZoom;
    const centerRealY = (camera.scrollTop + camera.clientHeight / 2) / currentZoom;

    const node = { id, type, x: centerRealX - 75, y: centerRealY - 35, data: '' };
    nodes.push(node);
    renderNodes();
    renderSVG();
    if(window.innerWidth <= 768) toggleSidebar(); 
}

function updateNodeData(id, val) {
    const node = nodes.find(n => n.id === id);
    if (node) node.data = val;
}

function deleteNode(id, event) {
    event.stopPropagation(); 
    nodes = nodes.filter(n => n.id !== id);
    links = links.filter(l => l.from !== id && l.to !== id);
    if (currentNode && currentNode.id === id) resetExecution();
    else { renderNodes(); renderSVG(); }
}

function renderNodes() {
    nodesLayer.innerHTML = '';
    nodes.forEach(node => {
        const el = document.createElement('div');
        el.className = `node node-${node.type} ${currentNode === node ? 'active' : ''}`;
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
        el.id = node.id;

        el.onpointerdown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.classList.contains('port') || e.target.classList.contains('btn-delete')) return;
            e.stopPropagation(); 
            el.setPointerCapture(e.pointerId);
            draggedNode = node;
            const coords = getRealCoords(e);
            dragOffset = { x: coords.x - node.x, y: coords.y - node.y };
        };

        // Rótulos Iconográficos Universais
        let rotulo = node.type.toUpperCase();
        if(node.type === 'inicio') rotulo = "▶ INÍCIO";
        else if(node.type === 'fim') rotulo = "⏹ FIM";
        else if(node.type === 'entrada') rotulo = "⌨️ LEIA";
        else if(node.type === 'saida') rotulo = "🖥️ ESCREVA";
        else if(node.type === 'processo') rotulo = "⚙️ PROCESSO";
        else if(node.type === 'decisao') rotulo = "❓ DECISÃO";

        let html = `
            <div class="btn-delete" onpointerdown="deleteNode('${node.id}', event)">✖</div>
            <b>${rotulo}</b>
        `;
        
        let ports = '';
        if (node.type !== 'inicio') ports += `<div class="port port-in" data-target-id="${node.id}"></div>`;

        if (node.type === 'decisao') {
            html += `<input placeholder="Ex: x > 5" value="${node.data}" oninput="updateNodeData('${node.id}', this.value)">`;
            ports += `
                <div class="port port-out-t" onpointerdown="startConnect('${node.id}', 'T', event)"></div><span class="port-label-t">V</span>
                <div class="port port-out-f" onpointerdown="startConnect('${node.id}', 'F', event)"></div><span class="port-label-f">F</span>
            `;
        } else if (['entrada', 'saida', 'processo'].includes(node.type)) {
            let placeholder = (node.type === 'processo') ? "Ex: x = x + 1" : (node.type === 'entrada') ? "Var: x" : "Ex: x + 10";
            html += `<input placeholder="${placeholder}" value="${node.data}" oninput="updateNodeData('${node.id}', this.value)">`;
            ports += `<div class="port port-out" onpointerdown="startConnect('${node.id}', 'out', event)"></div>`;
        } else if (node.type === 'inicio' || node.type === 'desvio') {
            ports += `<div class="port port-out" onpointerdown="startConnect('${node.id}', 'out', event)"></div>`;
        }

        el.innerHTML = html + ports;
        nodesLayer.appendChild(el);
    });
}

function startConnect(id, port, e) {
    e.stopPropagation();
    connectingData = { fromId: id, port: port };
    connIndicator.style.display = 'block';
    tempLine = { x1: 0, y1: 0, x2: 0, y2: 0 };
}

function cancelConnect() {
    connectingData = null;
    tempLine = null;
    connIndicator.style.display = 'none';
    renderSVG();
}

function getPortCoords(nodeId, portType) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return {x:0, y:0};

    let px = node.x; let py = node.y;
    const w = (node.type === 'decisao') ? 140 : (node.type === 'desvio') ? 40 : 150;
    const h = (node.type === 'decisao') ? 140 : (node.type === 'desvio') ? 40 : 70;

    if (portType === 'in') { px += w/2; }
    else if (portType === 'out') { px += w/2; py += h; }
    else if (portType === 'T') { px += 12; py += h/2; } 
    else if (portType === 'F') { px += w - 12; py += h/2; } 
    return {x: px, y: py};
}

function canvasMove(e) {
    if (draggedNode || connectingData) e.preventDefault(); 
    const coords = getRealCoords(e);

    if (draggedNode) {
        draggedNode.x = coords.x - dragOffset.x;
        draggedNode.y = coords.y - dragOffset.y;
        document.getElementById(draggedNode.id).style.left = draggedNode.x + 'px';
        document.getElementById(draggedNode.id).style.top = draggedNode.y + 'px';
        renderSVG();
    } else if (connectingData) {
        let p1 = getPortCoords(connectingData.fromId, connectingData.port);
        tempLine = { x1: p1.x, y1: p1.y, x2: coords.x, y2: coords.y };
        renderSVG();
    }
}

function canvasUp(e) {
    draggedNode = null;
    if (connectingData) {
        let targetEl = e.target;
        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
            targetEl = document.elementFromPoint(e.clientX, e.clientY);
        }

        if (targetEl && targetEl.classList.contains('port-in')) {
            const toId = targetEl.getAttribute('data-target-id');
            if (toId && toId !== connectingData.fromId) {
                links = links.filter(l => !(l.from === connectingData.fromId && l.port === connectingData.port));
                links.push({ from: connectingData.fromId, port: connectingData.port, to: toId });
            }
        }
        cancelConnect();
    }
}

// --- RENDERIZAÇÃO SVG (MANHATTAN) ---
function getOrthogonalPath(p1, p2, portType) {
    const offset = 30; 
    let path = `M ${p1.x} ${p1.y} `;

    if (portType === 'T' || portType === 'F') {
        let dirX = (portType === 'T') ? -1 : 1; 
        let midX = p1.x + (dirX * 80); 
        let midY = p2.y - offset; 
        path += `L ${midX} ${p1.y} L ${midX} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
    } else {
        if (p2.y > p1.y + offset) {
            let midY = (p1.y + p2.y) / 2;
            path += `L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
        } else {
            let midY1 = p1.y + offset;
            let escapeX = p1.x - 130; 
            let midY2 = p2.y - offset;
            path += `L ${p1.x} ${midY1} L ${escapeX} ${midY1} L ${escapeX} ${midY2} L ${p2.x} ${midY2} L ${p2.x} ${p2.y}`;
        }
    }
    return path;
}

function renderSVG() {
    let html = '';
    const strokeW = Math.max(2, 3 / currentZoom); 

    links.forEach(l => {
        let p1 = getPortCoords(l.from, l.port);
        let p2 = getPortCoords(l.to, 'in');
        let color = l.port === 'T' ? 'var(--accent)' : l.port === 'F' ? 'var(--danger)' : '#555';
        let pathData = getOrthogonalPath(p1, p2, l.port);

        html += `<path d="${pathData}" stroke="${color}" stroke-width="${strokeW}" fill="none" stroke-linejoin="round"/>`;
        html += `<polygon points="${p2.x-6},${p2.y-10} ${p2.x+6},${p2.y-10} ${p2.x},${p2.y}" fill="${color}"/>`;
    });

    if (tempLine) {
        let p1 = getPortCoords(connectingData.fromId, connectingData.port);
        html += `<path d="M ${p1.x} ${p1.y} L ${tempLine.x2} ${tempLine.y2}" stroke="#aaa" stroke-width="${strokeW}" stroke-dasharray="5,5" fill="none"/>`;
    }
    svgLayer.innerHTML = html;
}

// --- INTERPRETADOR LÓGICO ---
function evaluateExpr(expr) {
    let scope = { ...variables };
    
    // Tratamento invisível da vírgula decimal brasileira (ex: 2,5 vira 2.5)
    let safeExpr = expr.replace(/(\d),(\d)/g, '$1.$2');
    
    // Tratamento invisível do expoente (ex: 3 ^ 2 vira 3 ** 2)
    safeExpr = safeExpr.replace(/\^/g, '**');
    
    try {
        const keys = Object.keys(scope);
        const values = Object.values(scope);
        const func = new Function(...keys, "return " + safeExpr + ";");
        return func(...values);
    } catch (e) {
        logMsg(`Expressão inválida: "${expr}"`, 'error');
        return null;
    }
}

function updateMemory() {
    if (Object.keys(variables).length === 0) { memoryUI.innerHTML = "Variáveis limpas..."; return; }
    memoryUI.innerHTML = Object.entries(variables).map(([k, v]) => {
        let displayVal = typeof v === 'string' ? `"${v}"` : v;
        return `<div>${k} = <span style="color:var(--accent)">${displayVal}</span></div>`;
    }).join('');
}

function resetExecution() { 
    currentNode = null; 
    variables = {}; 
    isAnimating = false;
    autoRun = false;
    btnNext.disabled = false;
    btnRunAll.disabled = false;
    animLayer.innerHTML = ''; 
    // Console NÃO é mais limpo aqui para não apagar o histórico de erros ou finais de execução
    updateMemory(); 
    renderNodes(); 
}

function startAutoRun() {
    autoRun = true;
    runStep();
}

function advance(port) {
    const link = links.find(l => l.from === currentNode.id && l.port === port);
    
    if (link) {
        isAnimating = true;
        btnNext.disabled = true; 
        btnRunAll.disabled = true;

        const speed = parseInt(document.getElementById('sim-speed').value) || 1000;

        let p1 = getPortCoords(link.from, link.port);
        let p2 = getPortCoords(link.to, 'in');
        let pathData = getOrthogonalPath(p1, p2, link.port);

        const glow = document.createElementNS("http://www.w3.org/2000/svg", "path");
        glow.setAttribute("d", pathData);
        
        let color = link.port === 'T' ? 'var(--accent)' : link.port === 'F' ? 'var(--danger)' : '#ffffff';
        
        glow.setAttribute("stroke", color);
        glow.setAttribute("stroke-width", Math.max(4, 6 / currentZoom));
        glow.setAttribute("fill", "none");
        glow.setAttribute("stroke-linecap", "round");
        glow.style.filter = `drop-shadow(0 0 10px ${color})`;
        
        animLayer.appendChild(glow);

        const len = glow.getTotalLength();
        glow.style.strokeDasharray = len;
        glow.style.strokeDashoffset = len;
        glow.getBoundingClientRect(); 

        glow.style.transition = `stroke-dashoffset ${speed / 1000}s ease-in-out`;
        glow.style.strokeDashoffset = "0";

        setTimeout(() => {
            glow.style.transition = `opacity ${Math.min(0.2, speed / 2000)}s ease`;
            glow.style.opacity = "0";
            setTimeout(() => glow.remove(), 200);

            currentNode = nodes.find(n => n.id === link.to);
            renderNodes(); 
            isAnimating = false;
            btnNext.disabled = false;
            btnRunAll.disabled = false;
            
            if (currentNode.type === 'desvio') {
                runStep();
            } else if (autoRun && currentNode) {
                runStep();
            }

        }, speed); 

    } else {
        logMsg("Fluxo interrompido: Ponto sem conexão de saída.", "warn");
        currentNode = null;
        autoRun = false;
        renderNodes();
    }
}

async function runStep() {
    if (isAnimating) return; 

    if (!currentNode) {
        // Limpa o console APENAS no momento em que uma nova execução é solicitada do zero
        document.getElementById('console-ui').innerHTML = ''; 
        
        currentNode = nodes.find(n => n.type === 'inicio');
        if (!currentNode) {
            logMsg("O algoritmo exige um bloco de INÍCIO.", "error");
            autoRun = false;
            return;
        }
        logMsg(autoRun ? "Execução Contínua Iniciada." : "Execução Iniciada.", "info");
        renderNodes();
        if(autoRun) advance('out'); 
        return;
    }

    switch (currentNode.type) {
        case 'inicio': 
            advance('out'); 
            break;
        case 'desvio':
            advance('out');
            break;
        case 'entrada':
            if(!currentNode.data) { logMsg("Erro: Defina a variável alvo (ex: x).", "error"); autoRun = false; return; }
            
            let val = await askInput(currentNode.data);
            
            if(val !== null && val.trim() !== "") { 
                let numVal = Number(val);
                variables[currentNode.data.trim()] = isNaN(numVal) ? val : numVal; 
                
                updateMemory(); 
                logMsg(`Li variável [${currentNode.data.trim()}] = ${val}`);
                advance('out'); 
            } else {
                logMsg("Entrada cancelada pelo usuário. Execução parada.", "warn");
                resetExecution();
            }
            break;
        case 'processo':
            let parts = currentNode.data.split('=');
            if (parts.length === 2) {
                let varName = parts[0].trim(); let result = evaluateExpr(parts[1].trim());
                if(result !== null) { 
                    variables[varName] = result; 
                    updateMemory(); 
                    logMsg(`Processei [${varName}] = ${result}`);
                    advance('out'); 
                } else { autoRun = false; }
            } else { logMsg("Erro de Sintaxe: O Processamento exige 'variavel = expressao'.", "error"); autoRun = false;}
            break;
        case 'decisao':
            // Barreira Pedagógica
            let tempExpr = currentNode.data.replace(/==|!=|>=|<=/g, '');
            if (tempExpr.includes('=')) {
                logMsg(`Erro: "${currentNode.data}" não é uma sentença que é possível verificar se é ou não verdadeira. Para comparar valores, use "==".`, 'error');
                autoRun = false;
                resetExecution();
                return;
            }

            let cond = evaluateExpr(currentNode.data);
            if(cond !== null) {
                logMsg(`Avaliei: [${currentNode.data}] -> ${cond ? 'Verdadeiro' : 'Falso'}`);
                advance(cond ? 'T' : 'F');
            } else { autoRun = false; }
            break;
        case 'saida':
            let outVal = evaluateExpr(currentNode.data);
            if(outVal !== null) {
                logMsg(`<b>SAÍDA: ${outVal}</b>`, "info"); 
                await showOutput(outVal); 
                advance('out');
            } else { autoRun = false; }
            break;
        case 'fim':
            logMsg("Execução Finalizada com Sucesso.", "info"); 
            resetExecution(); 
            break;
    }
}