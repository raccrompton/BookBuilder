import yaml
import addict


# yaml_location = input('What is the full path to your config.yaml file? ')
yaml_location = '/Users/vincenttan/Code/work/BookBuilder/config.yaml'
with open(yaml_location, "r") as f:
    config = addict.Dict(yaml.safe_load(f))