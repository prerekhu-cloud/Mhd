#!/usr/bin/env python3
"""
Script to optimize 3D GLB models by reducing polygon count.
Reduces vertices to maximum 20,000 per model.
"""

import trimesh
import os
import json
from pathlib import Path

def get_file_size_mb(filepath):
    """Get file size in MB"""
    return os.path.getsize(filepath) / (1024 * 1024)

def reduce_mesh_polygons(input_path, output_path, target_vertices=20000):
    """
    Redukuje počet vrcholů 3D modelu na cílový počet
    
    Args:
        input_path: Cesta ke vstupnímu GLB/GLTF souboru
        output_path: Cesta k výstupnímu souboru
        target_vertices: Maximální počet vrcholů (default 20000)
    
    Returns:
        dict: Informace o redukci (původní/nový počet vrcholů, procento)
    """
    stats = {
        'file': os.path.basename(input_path),
        'input_size_mb': round(get_file_size_mb(input_path), 2),
        'success': False,
        'error': None,
        'original_vertices': 0,
        'optimized_vertices': 0,
        'reduction_percent': 0
    }
    
    try:
        # Načti model
        mesh = trimesh.load(input_path)
        
        # Počítej vrcholy
        if isinstance(mesh, trimesh.Scene):
            total_vertices = sum(len(geom.vertices) for geom in mesh.geometry.values())
        else:
            total_vertices = len(mesh.vertices) if hasattr(mesh, 'vertices') else 0
        
        stats['original_vertices'] = total_vertices
        print(f"\n📦 {stats['file']}")
        print(f"   Původní vrcholy: {total_vertices:,}")
        print(f"   Původní velikost: {stats['input_size_mb']} MB")
        
        # Zpracuj model
        if isinstance(mesh, trimesh.Scene):
            # Více mesí
            for geom_key, geom in mesh.geometry.items():
                if len(geom.vertices) > target_vertices:
                    target_count = max(100, int(len(geom.vertices) * 0.5))  # Snižuj na 50%
                    geom.simplify_mesh(target_count=target_count)
        else:
            # Jeden mesh
            if total_vertices > target_vertices:
                # Zjednodušení: snižuj na 50% nebo na cílový počet
                target_count = min(target_vertices, max(100, int(total_vertices * 0.5)))
                mesh.simplify_mesh(target_count=target_count)
        
        # Počítej nový počet vrcholů
        if isinstance(mesh, trimesh.Scene):
            new_vertices = sum(len(geom.vertices) for geom in mesh.geometry.values())
        else:
            new_vertices = len(mesh.vertices) if hasattr(mesh, 'vertices') else 0
        
        # Ulož model
        mesh.export(output_path)
        
        output_size = get_file_size_mb(output_path)
        reduction_percent = round(((total_vertices - new_vertices) / total_vertices * 100), 2) if total_vertices > 0 else 0
        
        stats['optimized_vertices'] = new_vertices
        stats['reduction_percent'] = reduction_percent
        stats['output_size_mb'] = round(output_size, 2)
        stats['success'] = True
        
        print(f"   ✅ Nové vrcholy: {new_vertices:,}")
        print(f"   📉 Redukce: {reduction_percent}%")
        print(f"   💾 Nová velikost: {output_size} MB")
        
    except Exception as e:
        stats['error'] = str(e)
        print(f"   ❌ Chyba: {e}")
    
    return stats

def main():
    """Hlavní funkce"""
    # GLB modely k optimizaci
    models = [
        "36tr.glb",
        "26tr.glb",
        "32tr.glb",
        "32trdoletrol.glb",
        "32tropava.glb",
        "Irisbus.glb",
        "Iveco10m.glb",
        "Iveco12m.glb",
        "Sorbus.glb",
        "Sorelektro.glb"
    ]
    
    # Vytvořit output adresář
    optimized_dir = "optimized_models"
    os.makedirs(optimized_dir, exist_ok=True)
    
    all_stats = []
    
    print("🚀 Zahájení optimizace 3D modelů...")
    print("=" * 60)
    
    for model_file in models:
        input_path = model_file
        output_path = os.path.join(optimized_dir, f"opt_{model_file}")
        
        if os.path.exists(input_path):
            stats = reduce_mesh_polygons(input_path, output_path, target_vertices=20000)
            all_stats.append(stats)
        else:
            print(f"\n⚠️  {model_file} - NENALEZEN")
    
    # Shrnutí
    print("\n" + "=" * 60)
    print("📊 SHRNUTÍ OPTIMIZACE")
    print("=" * 60)
    
    total_original = sum(s['original_vertices'] for s in all_stats if s['success'])
    total_optimized = sum(s['optimized_vertices'] for s in all_stats if s['success'])
    total_reduction = round(((total_original - total_optimized) / total_original * 100), 2) if total_original > 0 else 0
    
    print(f"\n✅ Úspěšně zpracováno: {sum(1 for s in all_stats if s['success'])}/{len(models)} modelů")
    print(f"📊 Celkové vrcholy (původní): {total_original:,}")
    print(f"📊 Celkové vrcholy (optimizované): {total_optimized:,}")
    print(f"📉 Celková redukce: {total_reduction}%")
    
    # Ulož statistiku
    with open(f"{optimized_dir}/optimization_stats.json", 'w') as f:
        json.dump(all_stats, f, indent=2)
    
    print(f"\n💾 Statistika uložena: {optimized_dir}/optimization_stats.json")
    print(f"📁 Optimizované modely: {optimized_dir}/")

if __name__ == "__main__":
    main()
