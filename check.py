import asyncio
import os
import sys

async def main():
    print("====================================================")
    print("  RocketRide & Gemini Agent Pipeline Setup Checker  ")
    print("====================================================\n")
    
    # 1. Check environment file
    print("[1/4] Checking .env configuration...")
    if not os.path.exists(".env"):
        print("  [ERROR] .env file not found!")
        return
    
    # Load dotenv
    try:
        from dotenv import load_dotenv
        load_dotenv()
        print("  [OK] .env file loaded successfully.")
    except ImportError:
        print("  [WARN] python-dotenv not installed, parsing .env manually...")
        # Simple manual fallback
        with open(".env") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ[k] = v
    
    # Check required variables
    mcp_key = os.getenv("ROCKETRIDE_GEMINI_KEY")
    if not mcp_key:
        print("  [ERROR] ROCKETRIDE_GEMINI_KEY not found in .env!")
        print("     Please ensure it is set to a valid Gemini API key.")
        return
    print("  [OK] ROCKETRIDE_GEMINI_KEY is present.")
    
    # 2. Check Pipeline File
    print("\n[2/4] Checking pipeline file...")
    if not os.path.exists("gemini_agent.pipe"):
        print("  [ERROR] gemini_agent.pipe not found in root!")
        return
    print("  [OK] gemini_agent.pipe is present.")
    
    # 3. Check MCP Server Script
    print("\n[3/4] Checking MCP server script...")
    mcp_path = "backend/mcp_server.py"
    if not os.path.exists(mcp_path):
        print(f"  [ERROR] {mcp_path} not found!")
        return
    print(f"  [OK] {mcp_path} is present.")
    
    # 4. Check for rocketride and mcp SDKs
    print("\n[4/4] Checking package installations...")
    mcp_installed = False
    try:
        import mcp
        print("  [OK] 'mcp' Python SDK is installed.")
        mcp_installed = True
    except ImportError:
        print("  [WARN] 'mcp' Python SDK is not installed in the active environment.")
        print("     Run: pip install mcp")
        
    rr_installed = False
    try:
        import rocketride
        print("  [OK] 'rocketride' Python SDK is installed.")
        rr_installed = True
    except ImportError:
        print("  [WARN] 'rocketride' Python SDK is not installed.")
        print("     Run: pip install rocketride")
        
    if not (mcp_installed and rr_installed):
        print("\n[!] Please install the missing dependencies above to run the pipeline.")
        return

    print("\n[OK] Verification complete! All pipeline components and scripts are in place.")
    print("To test the pipeline execution via Python, you can run: python check.py --run")

if __name__ == "__main__":
    # If the user runs with '--run', we attempt to run the pipeline
    if len(sys.argv) > 1 and sys.argv[1] == "--run":
        try:
            from rocketride import RocketRideClient
            from rocketride.schema import Question
            
            async def run_pipeline():
                async with RocketRideClient() as client:
                    print("Connecting to RocketRide server...")
                    result = await client.use(filepath="gemini_agent.pipe", use_existing=True)
                    token = result["token"]
                    print(f"Pipeline active. Token: {token}")
                    
                    print("Sending prompt to Gemini Agent...")
                    q = Question()
                    q.addQuestion("Please trigger the test backend function to log an entry.")
                    
                    response = await client.chat(token=token, question=q)
                    print("\nResponse received:")
                    print(response.get("answers", ["No answer returned"])[0])
            
            asyncio.run(run_pipeline())
        except Exception as e:
            print(f"\n[ERROR] Error running pipeline: {e}")
    else:
        asyncio.run(main())
