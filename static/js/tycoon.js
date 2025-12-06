import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- CONFIGURATION DE BASE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcccccc); // Gris neutre pour le fond
scene.fog = new THREE.Fog(0xcccccc, 10, 50); // Brouillard pour la profondeur

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Activer les ombres
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- LUMIÈRES ---
// Lumière ambiante (douce, partout)
const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(ambientLight);

// Lumière directionnelle (soleil, projette des ombres)
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// --- CONTROLES CAMÉRA ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

// --- CHARGEMENT DES MODÈLES ---
const loader = new GLTFLoader();
const loadingElem = document.getElementById('loading');
let loadedCount = 0;
const totalModelsToLoad = 4; // Nombre de modèles qu'on appelle ci-dessous

function loadModel(fileName, x, y, z, rotationY = 0) {
    const path = `./assets/models/${fileName}`;
    
    loader.load(path, (gltf) => {
        const model = gltf.scene;
        
        // Positionnement
        model.position.set(x, y, z);
        model.rotation.y = rotationY;

        // Gestion des ombres pour chaque mesh du modèle
        model.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        scene.add(model);
        
        // Gestion simple du chargement
        loadedCount++;
        if(loadedCount === totalModelsToLoad) {
            loadingElem.style.display = 'none';
        }

    }, undefined, (error) => {
        console.error(`Erreur lors du chargement de ${fileName}:`, error);
    });
}

// --- CONSTRUCTION DE LA SCÈNE ---
// Note: Les assets Kenney sont souvent petits ou à une échelle spécifique.
// Ajuste l'échelle si nécessaire (ex: model.scale.set(1,1,1)).

// 1. Le Sol (On en met 4 pour faire une surface)
loadModel('floorFull.glb', 0, 0, 0);
loadModel('floorFull.glb', 0, 0, 2);
loadModel('floorFull.glb', 2, 0, 0);
loadModel('floorFull.glb', 2, 0, 2);
// Corrige le totalModelsToLoad plus haut si tu ajoutes des lignes ici.

// 2. Meubles
// Lit double
loadModel('bedDouble.glb', 1, 0, 1, Math.PI); 

// Table basse
loadModel('tableCoffee.glb', -0.5, 0, 1);

// Lampe sur pied
loadModel('lampRoundFloor.glb', -1.5, 0, 0.5);

// --- BOUCLE D'ANIMATION ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

// --- GESTION DU REDIMENSIONNEMENT ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});